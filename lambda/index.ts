/**
 * Mobile App Authentication Lambda Handler
 * Handles email magic links, SMS magic links, token verification, and session management
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sesClient = new SESClient({});
const snsClient = new SNSClient({});
const secretsClient = new SecretsManagerClient({});

// Environment variables
const TOKENS_TABLE = process.env.TOKENS_TABLE || 'mobile-auth-tokens';
const APPROVED_EMAILS_TABLE = process.env.APPROVED_EMAILS_TABLE || 'mobile-approved-emails';
const JWT_SECRET_NAME = process.env.JWT_SECRET_NAME || 'mobile-app/jwt-secret';
const API_KEY_SECRET_NAME = process.env.API_KEY_SECRET_NAME || 'mobile-app/api-key';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@sigmacomputing.com';
const FROM_NAME = process.env.FROM_NAME || null;
const APP_DEEP_LINK_SCHEME = process.env.APP_DEEP_LINK_SCHEME || 'bigbuys';

// Cache for secrets (reduces Secrets Manager calls)
let jwtSecret: string | null = null;
let apiKey: string | null = null;

/**
 * Main Lambda handler - routes to appropriate function based on path
 */
export const handler = async (event: any) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    let path = event.path || event.rawPath;
    const method = event.httpMethod || event.requestContext?.http?.method;

    console.log(`Original path: ${path}, method: ${method}`);

    // Normalize path - API Gateway with AWS_PROXY does NOT include stage name in path
    // If resources are at /auth/... level, path will be /auth/...
    // If resources are at /v1/auth/... level, path will be /v1/auth/...
    // Normalize both to /v1/auth/... format for consistent routing
    if (path.startsWith('/v1/v1/')) {
      // Handle duplicate /v1 case
      path = path.replace('/v1/v1/', '/v1/');
      console.log(`Normalized from /v1/v1/ to: ${path}`);
    } else if (path.startsWith('/auth/')) {
      // Handle resources at root level - add /v1 prefix
      path = '/v1' + path;
      console.log(`Normalized from /auth/ to: ${path}`);
    }

    console.log(`Final path for routing: ${path}, method: ${method}`);

    // Parse body for POST requests
    let body = {};
    if (method === 'POST' && event.body) {
      body = JSON.parse(event.body);
    }

    // Route to appropriate handler
    if (path === '/v1/auth/request-magic-link' && method === 'POST') {
      return await handleRequestMagicLink(body);
    } else if (path === '/v1/auth/send-to-mobile' && method === 'POST') {
      return await handleSendToMobile(body, event);
    } else if (path === '/v1/auth/verify-magic-link' && method === 'POST') {
      return await handleVerifyMagicLink(body, event);
    } else if (path === '/v1/auth/refresh-token' && method === 'POST') {
      return await handleRefreshToken(body, event);
    } else {
      console.log(`No route matched. Path: ${path}, Method: ${method}`);
      return createResponse(404, { error: 'Not found', debug: { receivedPath: path, method } });
    }
  } catch (error) {
    console.error('Unhandled error:', error);
    return createResponse(500, { 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Handle email magic link request (self-service registration)
 */
async function handleRequestMagicLink(body: any) {
  const { email } = body;

  // Validate input
  if (!email || !isValidEmail(email)) {
    return createResponse(400, { error: 'Valid email is required' });
  }

  const emailLower = email.toLowerCase();

  // Check if email is approved
  const isApproved = await isEmailApproved(emailLower);
  if (!isApproved) {
    return createResponse(403, { 
      error: 'Email not approved',
      message: 'This email is not approved for access. Please contact your administrator.'
    });
  }

  // Generate magic link token
  const tokenId = `tok_ml_${randomBytes(16).toString('hex')}`;
  const userId = await getUserIdForEmail(emailLower);
  const expiresAt = Math.floor(Date.now() / 1000) + 900; // 15 minutes

  // Store token in DynamoDB
  await docClient.send(new PutCommand({
    TableName: TOKENS_TABLE,
    Item: {
      tokenId,
      tokenType: 'magic_link',
      email: emailLower,
      userId,
      deviceId: null,
      createdAt: Math.floor(Date.now() / 1000),
      expiresAt,
      used: false,
      usedAt: null,
      sessionJWT: null,
      metadata: {
        sourceFlow: 'email'
      }
    }
  }));

  // Send email with magic link
  const magicLink = `${APP_DEEP_LINK_SCHEME}://auth?token=${tokenId}`;
  await sendMagicLinkEmail(emailLower, magicLink);

  return createResponse(200, {
    success: true,
    message: 'Magic link sent to your email',
    expiresIn: 900
  });
}

/**
 * Handle SMS magic link request (desktop-to-mobile handoff)
 */
async function handleSendToMobile(body: any, event: any) {
  const { email, phoneNumber, apiKey: providedApiKey, dashboardId } = body;

  // Validate API key
  const validApiKey = await getApiKey();
  if (providedApiKey !== validApiKey) {
    return createResponse(401, { error: 'Invalid API key' });
  }

  // Validate input
  if (!email || !phoneNumber) {
    return createResponse(400, { error: 'Email and phone number are required' });
  }

  if (!isValidPhoneNumber(phoneNumber)) {
    return createResponse(400, { error: 'Invalid phone number format. Use E.164 format (e.g., +14155551234)' });
  }

  const emailLower = email.toLowerCase();

  // Email should already be approved (user authenticated in desktop app)
  // But we'll check anyway for safety
  const isApproved = await isEmailApproved(emailLower);
  if (!isApproved) {
    return createResponse(403, { error: 'Email not approved' });
  }

  // Generate magic link token
  const tokenId = `tok_ml_${randomBytes(16).toString('hex')}`;
  const userId = await getUserIdForEmail(emailLower);
  const expiresAt = Math.floor(Date.now() / 1000) + 900; // 15 minutes

  // Store token in DynamoDB
  await docClient.send(new PutCommand({
    TableName: TOKENS_TABLE,
    Item: {
      tokenId,
      tokenType: 'magic_link',
      email: emailLower,
      phoneNumber,
      userId,
      deviceId: null,
      createdAt: Math.floor(Date.now() / 1000),
      expiresAt,
      used: false,
      usedAt: null,
      sessionJWT: null,
      metadata: {
        sourceFlow: 'sms',
        dashboardId: dashboardId || null
      }
    }
  }));

  // Send SMS with magic link
  let magicLink = `${APP_DEEP_LINK_SCHEME}://auth?token=${tokenId}`;
  if (dashboardId) {
    magicLink += `&dashboardId=${encodeURIComponent(dashboardId)}`;
  }
  
  await sendMagicLinkSMS(phoneNumber, magicLink);

  return createResponse(200, {
    success: true,
    message: 'Magic link sent via SMS',
    expiresIn: 900
  });
}

/**
 * Verify magic link token and issue session JWT
 */
async function handleVerifyMagicLink(body: any, event: any) {
  const { token, deviceId } = body;

  if (!token) {
    return createResponse(400, { error: 'Token is required' });
  }

  if (!deviceId) {
    return createResponse(400, { error: 'Device ID is required' });
  }

  // Get token from DynamoDB
  const result = await docClient.send(new GetCommand({
    TableName: TOKENS_TABLE,
    Key: { tokenId: token }
  }));

  if (!result.Item) {
    return createResponse(404, { error: 'Invalid or expired token' });
  }

  const tokenData = result.Item;

  // Validate token
  if (tokenData.tokenType !== 'magic_link') {
    return createResponse(400, { error: 'Invalid token type' });
  }

  if (tokenData.used) {
    return createResponse(400, { error: 'Token already used' });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > tokenData.expiresAt) {
    return createResponse(400, { error: 'Token expired' });
  }

  // Mark token as used
  await docClient.send(new UpdateCommand({
    TableName: TOKENS_TABLE,
    Key: { tokenId: token },
    UpdateExpression: 'SET #used = :true, usedAt = :now',
    ExpressionAttributeNames: { '#used': 'used' },
    ExpressionAttributeValues: { ':true': true, ':now': now }
  }));

  // Generate session JWT
  const sessionExpiresAt = now + (30 * 24 * 60 * 60); // 30 days
  const sessionToken = await generateSessionJWT({
    userId: tokenData.userId,
    email: tokenData.email,
    deviceId,
    expiresAt: sessionExpiresAt
  });

  // Store session in DynamoDB
  const sessionId = `ses_${randomBytes(16).toString('hex')}`;
  await docClient.send(new PutCommand({
    TableName: TOKENS_TABLE,
    Item: {
      tokenId: sessionId,
      tokenType: 'session',
      email: tokenData.email,
      userId: tokenData.userId,
      deviceId,
      createdAt: now,
      expiresAt: sessionExpiresAt,
      used: true,
      usedAt: now,
      sessionJWT: sessionToken,
      metadata: {
        sourceFlow: tokenData.metadata?.sourceFlow || 'unknown',
        dashboardId: tokenData.metadata?.dashboardId || null,
        lastUsedAt: now
      }
    }
  }));

  return createResponse(200, {
    success: true,
    token: sessionToken,
    expiresAt: sessionExpiresAt,
    user: {
      userId: tokenData.userId,
      email: tokenData.email
    },
    dashboardId: tokenData.metadata?.dashboardId || null
  });
}

/**
 * Refresh session token before expiry
 */
async function handleRefreshToken(body: any, event: any) {
  const { token } = body;

  if (!token) {
    return createResponse(400, { error: 'Token is required' });
  }

  try {
    // Verify existing JWT
    const secret = await getJWTSecret();
    const decoded = jwt.verify(token, secret) as any;

    const now = Math.floor(Date.now() / 1000);
    
    // Check if token is close to expiry (within 7 days)
    const timeUntilExpiry = decoded.exp - now;
    if (timeUntilExpiry > 7 * 24 * 60 * 60) {
      return createResponse(200, {
        success: true,
        message: 'Token still valid, no refresh needed',
        token,
        expiresAt: decoded.exp
      });
    }

    // Generate new session JWT
    const sessionExpiresAt = now + (30 * 24 * 60 * 60); // 30 days
    const newToken = await generateSessionJWT({
      userId: decoded.userId,
      email: decoded.email,
      deviceId: decoded.deviceId,
      expiresAt: sessionExpiresAt
    });

    // Update session in DynamoDB
    const sessionId = `ses_${randomBytes(16).toString('hex')}`;
    await docClient.send(new PutCommand({
      TableName: TOKENS_TABLE,
      Item: {
        tokenId: sessionId,
        tokenType: 'session',
        email: decoded.email,
        userId: decoded.userId,
        deviceId: decoded.deviceId,
        createdAt: now,
        expiresAt: sessionExpiresAt,
        used: true,
        usedAt: now,
        sessionJWT: newToken,
        metadata: {
          sourceFlow: 'refresh',
          lastUsedAt: now
        }
      }
    }));

    return createResponse(200, {
      success: true,
      token: newToken,
      expiresAt: sessionExpiresAt
    });

  } catch (error) {
    console.error('Token verification failed:', error);
    return createResponse(401, { error: 'Invalid or expired token' });
  }
}

/**
 * Check if email is approved for access
 */
async function isEmailApproved(email: string): Promise<boolean> {
  const emailLower = email.toLowerCase();

  // Auto-approve Sigma emails
  if (emailLower.endsWith('@sigmacomputing.com')) {
    return true;
  }

  // Check approved emails table
  try {
    const result = await docClient.send(new GetCommand({
      TableName: APPROVED_EMAILS_TABLE,
      Key: { email: emailLower }
    }));

    if (!result.Item) {
      return false;
    }

    // Check if approval has expiration date
    if (result.Item.expiresAt) {
      const now = Math.floor(Date.now() / 1000);
      return now < result.Item.expiresAt;
    }

    return true;
  } catch (error) {
    console.error('Error checking email approval:', error);
    return false;
  }
}

/**
 * Get or create user ID for email
 */
async function getUserIdForEmail(email: string): Promise<string> {
  // Query for existing sessions/tokens for this email
  const result = await docClient.send(new QueryCommand({
    TableName: TOKENS_TABLE,
    IndexName: 'email-index',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: { ':email': email },
    Limit: 1
  }));

  if (result.Items && result.Items.length > 0) {
    return result.Items[0].userId;
  }

  // Generate new user ID
  return `usr_${randomBytes(8).toString('hex')}`;
}

/**
 * Generate session JWT
 */
async function generateSessionJWT(payload: {
  userId: string;
  email: string;
  deviceId: string;
  expiresAt: number;
}): Promise<string> {
  const secret = await getJWTSecret();
  
  return jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      deviceId: payload.deviceId,
      iat: Math.floor(Date.now() / 1000),
      exp: payload.expiresAt
    },
    secret,
    { algorithm: 'HS256' }
  );
}

/**
 * Send magic link via email
 */
async function sendMagicLinkEmail(email: string, magicLink: string): Promise<void> {
  const emailBody = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #007AFF;">Welcome to Big Buys Mobile!</h2>
          <p>Click the button below to sign in to your account:</p>
          <div style="margin: 30px 0;">
            <a href="${magicLink}" 
               style="background-color: #007AFF; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Sign In to Big Buys Mobile
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            This link will expire in 15 minutes and can only be used once.
          </p>
          <p style="color: #666; font-size: 14px;">
            If you didn't request this email, you can safely ignore it.
          </p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
          <p style="color: #999; font-size: 12px;">
            Big Buys Mobile by Sigma Computing
          </p>
        </div>
      </body>
    </html>
  `;

  // Format "From" field: "Display Name" <email@example.com> or just email@example.com
  const fromAddress = FROM_NAME 
    ? `"${FROM_NAME}" <${FROM_EMAIL}>` 
    : FROM_EMAIL;

  await sesClient.send(new SendEmailCommand({
    Source: fromAddress,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: 'Sign in to Big Buys Mobile' },
      Body: {
        Html: { Data: emailBody },
        Text: { Data: `Sign in to Big Buys Mobile: ${magicLink}\n\nThis link expires in 15 minutes.` }
      }
    }
  }));

  console.log(`Magic link email sent to ${email}`);
}

/**
 * Send magic link via SMS
 */
async function sendMagicLinkSMS(phoneNumber: string, magicLink: string): Promise<void> {
  const message = `Your Big Buys Mobile sign-in link: ${magicLink}\n\nExpires in 15 minutes.`;

  await snsClient.send(new PublishCommand({
    PhoneNumber: phoneNumber,
    Message: message
  }));

  console.log(`Magic link SMS sent to ${phoneNumber}`);
}

/**
 * Get JWT secret from Secrets Manager (cached)
 */
async function getJWTSecret(): Promise<string> {
  if (jwtSecret) {
    return jwtSecret;
  }

  const result = await secretsClient.send(new GetSecretValueCommand({
    SecretId: JWT_SECRET_NAME
  }));

  jwtSecret = result.SecretString || '';
  return jwtSecret;
}

/**
 * Get API key from Secrets Manager (cached)
 */
async function getApiKey(): Promise<string> {
  if (apiKey) {
    return apiKey;
  }

  const result = await secretsClient.send(new GetSecretValueCommand({
    SecretId: API_KEY_SECRET_NAME
  }));

  apiKey = result.SecretString || '';
  return apiKey;
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (E.164 format)
 */
function isValidPhoneNumber(phoneNumber: string): boolean {
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber);
}

/**
 * Create HTTP response
 */
function createResponse(statusCode: number, body: any) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}