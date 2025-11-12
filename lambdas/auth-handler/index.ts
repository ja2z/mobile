/**
 * Mobile App Authentication Lambda Handler
 * Handles email magic links, SMS magic links, token verification, and session management
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { validateUserExpiration, checkUserDeactivated, getUserProfile, validateRole } from '../shared/user-validation';
import { logActivity, logActivityAndUpdateLastActive } from '../shared/activity-logger';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sesClient = new SESClient({});
const snsClient = new SNSClient({});
const secretsClient = new SecretsManagerClient({});

// Environment variables
const TOKENS_TABLE = process.env.TOKENS_TABLE || 'mobile-auth-tokens';
const APPROVED_EMAILS_TABLE = process.env.APPROVED_EMAILS_TABLE || 'mobile-approved-emails';
const USERS_TABLE = process.env.USERS_TABLE || 'mobile-users';
const JWT_SECRET_NAME = process.env.JWT_SECRET_NAME || 'mobile-app/jwt-secret';
const API_KEY_SECRET_NAME = process.env.API_KEY_SECRET_NAME || 'mobile-app/api-key';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@sigmacomputing.com';
const FROM_NAME = process.env.FROM_NAME || null;
const APP_DEEP_LINK_SCHEME = process.env.APP_DEEP_LINK_SCHEME || 'bigbuys';
const REDIRECT_BASE_URL = process.env.REDIRECT_BASE_URL || 'https://mobile.bigbuys.io';
const ACTIVITY_TABLE = process.env.ACTIVITY_TABLE || 'mobile-user-activity';

// Cache for secrets (reduces Secrets Manager calls)
let jwtSecret: string | null = null;
let apiKey: string | null = null;

/**
 * Main Lambda handler - routes to appropriate function based on path
 */
export const handler = async (event: any) => {
  console.log('[handler] ========== LAMBDA INVOCATION START ==========');
  console.log('[handler] Received event:', JSON.stringify(event, null, 2));
  console.log('[handler] Event type:', typeof event);
  console.log('[handler] Event keys:', Object.keys(event || {}));

  try {
    let path = event.path || event.rawPath;
    const method = event.httpMethod || event.requestContext?.http?.method;

    console.log('[handler] Original path:', path, 'method:', method);

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
      console.log('[handler] Parsing request body, body type:', typeof event.body);
      try {
        body = JSON.parse(event.body);
        console.log('[handler] Parsed body:', JSON.stringify(body));
      } catch (parseError) {
        console.error('[handler] Error parsing body:', parseError);
        console.error('[handler] Body content:', event.body);
        return createResponse(400, { error: 'Invalid JSON in request body' });
      }
    }

    // Route to appropriate handler
    console.log('[handler] Routing to handler, path:', path, 'method:', method);
    if (path === '/v1/auth/request-magic-link' && method === 'POST') {
      console.log('[handler] Routing to handleRequestMagicLink');
      const response = await handleRequestMagicLink(body, event);
      console.log('[handler] handleRequestMagicLink returned, status:', response.statusCode);
      return response;
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
    console.error('[handler] ========== UNHANDLED ERROR IN MAIN HANDLER ==========');
    console.error('[handler] Error type:', typeof error);
    console.error('[handler] Error:', error);
    console.error('[handler] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[handler] Error stack:', error instanceof Error ? error.stack : 'No stack');
    if (error instanceof Error) {
      console.error('[handler] Error name:', error.name);
      console.error('[handler] Error code:', (error as any).code);
    }
    console.error('[handler] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return createResponse(500, { 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get IP address from event
 */
function getIpAddress(event: any): string | undefined {
  return event.requestContext?.identity?.sourceIp || 
         event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
         event.headers?.['X-Forwarded-For']?.split(',')[0]?.trim();
}

/**
 * Handle email magic link request (self-service registration)
 */
async function handleRequestMagicLink(body: any, event?: any) {
  console.log('[handleRequestMagicLink] Starting magic link request');
  console.log('[handleRequestMagicLink] Body:', JSON.stringify(body));
  console.log('[handleRequestMagicLink] Event keys:', Object.keys(event || {}));
  
  try {
    const { email, linkType = 'universal' } = body; // Default to 'universal' for backward compatibility
    console.log('[handleRequestMagicLink] Extracted email:', email, 'linkType:', linkType);

    // Validate input
    if (!email || !isValidEmail(email)) {
      console.log('[handleRequestMagicLink] Invalid email format:', email);
      // Log failed login attempt (don't let failures break the flow)
      try {
        const ipAddress = event ? getIpAddress(event) : undefined;
        console.log('[handleRequestMagicLink] Logging failed login attempt, IP:', ipAddress);
        await logActivity('failed_login', 'unknown', email, {
          reason: 'Invalid email format',
          sourceFlow: 'email'
        }, undefined, ipAddress);
        console.log('[handleRequestMagicLink] Failed login activity logged successfully');
      } catch (activityError) {
        console.error('[handleRequestMagicLink] Failed to log activity:', activityError);
        console.error('[handleRequestMagicLink] Activity error stack:', activityError instanceof Error ? activityError.stack : 'No stack');
      }
      
      return createResponse(400, { error: 'Valid email is required' });
    }

    // Validate linkType
    if (linkType !== 'direct' && linkType !== 'universal') {
      console.log('[handleRequestMagicLink] Invalid linkType:', linkType);
      return createResponse(400, { error: 'Invalid linkType. Must be "direct" or "universal"' });
    }

    const emailLower = email.toLowerCase();
    console.log('[handleRequestMagicLink] Normalized email:', emailLower);

    // Check if email is approved
    console.log('[handleRequestMagicLink] Checking if email is approved...');
    let isApproved = false;
    try {
      isApproved = await isEmailApproved(emailLower);
      console.log('[handleRequestMagicLink] Email approval check result:', isApproved);
    } catch (error) {
      console.error('[handleRequestMagicLink] Error checking email approval:', error);
      console.error('[handleRequestMagicLink] Approval check error details:', error instanceof Error ? error.message : String(error));
      console.error('[handleRequestMagicLink] Approval check error stack:', error instanceof Error ? error.stack : 'No stack');
      // Fail closed - if we can't check approval, don't allow access
      return createResponse(500, { 
        error: 'Internal server error',
        message: 'Unable to verify email approval. Please try again later.'
      });
    }

    if (!isApproved) {
      console.log('[handleRequestMagicLink] Email not approved:', emailLower);
      // Log failed login attempt (don't let failures break the flow)
      try {
        const ipAddress = event ? getIpAddress(event) : undefined;
        console.log('[handleRequestMagicLink] Logging failed login (not approved), IP:', ipAddress);
        await logActivity('failed_login', 'unknown', emailLower, {
          reason: 'Email not approved',
          sourceFlow: 'email'
        }, undefined, ipAddress);
        console.log('[handleRequestMagicLink] Failed login activity logged successfully');
      } catch (activityError) {
        console.error('[handleRequestMagicLink] Failed to log activity:', activityError);
        console.error('[handleRequestMagicLink] Activity error stack:', activityError instanceof Error ? activityError.stack : 'No stack');
      }
      
      return createResponse(403, { 
        error: 'Email not approved',
        message: 'This email is not approved for access. Please contact your administrator.'
      });
    }

    // Generate magic link token
    // Note: Don't create user profile here - only create after successful authentication
    console.log('[handleRequestMagicLink] Generating magic link token...');
    const tokenId = `tok_ml_${randomBytes(16).toString('hex')}`;
    console.log('[handleRequestMagicLink] Generated tokenId:', tokenId);
    
    // Generate temporary userId for token (will be replaced with actual userId during verification)
    console.log('[handleRequestMagicLink] Getting userId for email...');
    let tempUserId: string;
    try {
      tempUserId = await getUserIdForEmail(emailLower);
      console.log('[handleRequestMagicLink] Retrieved tempUserId:', tempUserId);
    } catch (error) {
      console.error('[handleRequestMagicLink] Error getting userId for email:', error);
      console.error('[handleRequestMagicLink] getUserIdForEmail error details:', error instanceof Error ? error.message : String(error));
      console.error('[handleRequestMagicLink] getUserIdForEmail error stack:', error instanceof Error ? error.stack : 'No stack');
      // Generate a temporary userId if lookup fails
      tempUserId = `usr_${randomBytes(8).toString('hex')}`;
      console.log('[handleRequestMagicLink] Generated fallback tempUserId:', tempUserId);
    }
    
    if (!tempUserId) {
      console.error('[handleRequestMagicLink] CRITICAL: tempUserId is undefined!');
      throw new Error('tempUserId is undefined after getUserIdForEmail');
    }
    
    const expiresAt = Math.floor(Date.now() / 1000) + 900; // 15 minutes
    console.log('[handleRequestMagicLink] Token expiresAt:', expiresAt);

    // Store token in DynamoDB
    console.log('[handleRequestMagicLink] Storing token in DynamoDB, table:', TOKENS_TABLE);
    try {
      const tokenItem = {
        tokenId,
        tokenType: 'magic_link',
        email: emailLower,
        userId: tempUserId,
        deviceId: null,
        createdAt: Math.floor(Date.now() / 1000),
        expiresAt,
        used: false,
        usedAt: null,
        sessionJWT: null,
        metadata: {
          sourceFlow: 'email'
        }
      };
      console.log('[handleRequestMagicLink] Token item to store:', JSON.stringify(tokenItem));
      
      await docClient.send(new PutCommand({
        TableName: TOKENS_TABLE,
        Item: tokenItem
      }));
      console.log('[handleRequestMagicLink] Token stored successfully in DynamoDB');
    } catch (error) {
      console.error('[handleRequestMagicLink] Error storing token in DynamoDB:', error);
      console.error('[handleRequestMagicLink] DynamoDB error details:', error instanceof Error ? error.message : String(error));
      console.error('[handleRequestMagicLink] DynamoDB error stack:', error instanceof Error ? error.stack : 'No stack');
      if (error instanceof Error) {
        console.error('[handleRequestMagicLink] DynamoDB error name:', error.name);
        console.error('[handleRequestMagicLink] DynamoDB error code:', (error as any).code);
      }
      return createResponse(500, { 
        error: 'Internal server error',
        message: 'Failed to create magic link. Please try again later.'
      });
    }

    // Always use HTTPS redirect URL in emails (email clients require HTTPS and block custom schemes)
    // The redirect page will convert to bigbuys:// scheme for the app
    console.log('[handleRequestMagicLink] Building redirect URL...');
    const magicLink = buildRedirectUrl(tokenId, null);
    console.log('[handleRequestMagicLink] Generated magic link:', magicLink);
    
    console.log('[handleRequestMagicLink] Sending magic link email...');
    try {
      await sendMagicLinkEmail(emailLower, magicLink);
      console.log('[handleRequestMagicLink] Magic link email sent successfully');
    } catch (error) {
      console.error('[handleRequestMagicLink] Error sending magic link email:', error);
      console.error('[handleRequestMagicLink] Email error details:', error instanceof Error ? error.message : String(error));
      console.error('[handleRequestMagicLink] Email error stack:', error instanceof Error ? error.stack : 'No stack');
      if (error instanceof Error) {
        console.error('[handleRequestMagicLink] Email error name:', error.name);
        console.error('[handleRequestMagicLink] Email error code:', (error as any).code);
      }
      return createResponse(500, { 
        error: 'Internal server error',
        message: 'Failed to send magic link email. Please try again later.'
      });
    }

    console.log('[handleRequestMagicLink] Magic link request completed successfully');
    return createResponse(200, {
      success: true,
      message: 'Magic link sent to your email',
      expiresIn: 900
    });
  } catch (error: any) {
    console.error('[handleRequestMagicLink] UNEXPECTED ERROR:', error);
    console.error('[handleRequestMagicLink] Error type:', typeof error);
    console.error('[handleRequestMagicLink] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[handleRequestMagicLink] Error stack:', error?.stack);
    if (error instanceof Error) {
      console.error('[handleRequestMagicLink] Error name:', error.name);
      console.error('[handleRequestMagicLink] Error code:', (error as any).code);
    }
    console.error('[handleRequestMagicLink] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return createResponse(500, { 
      error: 'Internal server error',
      message: 'An unexpected error occurred. Please try again later.'
    });
  }
}

/**
 * Handle SMS magic link request (desktop-to-mobile handoff)
 */
async function handleSendToMobile(body: any, event: any) {
  const { email, phoneNumber, app, linkType = 'universal', emailhash } = body;

  // Get API key from header (API Gateway may lowercase headers)
  const headers = event.headers || {};
  const providedApiKey = headers['X-API-Key'] || headers['x-api-key'] || headers['X-Api-Key'];
  
  if (!providedApiKey) {
    return createResponse(401, { error: 'API key required in X-API-Key header' });
  }

  // Validate API key
  const validApiKey = await getApiKey();
  // Trim whitespace (Secrets Manager sometimes includes trailing newlines)
  const trimmedProvided = (providedApiKey || '').trim();
  const trimmedValid = (validApiKey || '').trim();
  
  // Debug logging (remove in production if sensitive)
  console.log(`API key validation: provided length=${trimmedProvided.length}, valid length=${trimmedValid.length}, match=${trimmedProvided === trimmedValid}`);
  
  if (trimmedProvided !== trimmedValid) {
    return createResponse(401, { error: 'Invalid API key' });
  }

  // Validate input
  if (!email || !phoneNumber) {
    return createResponse(400, { error: 'Email and phone number are required' });
  }

  // Validate email hash (required for security)
  if (!emailhash) {
    return createResponse(400, { error: 'Email hash is required' });
  }

  // Get the secret key (same as API key secret) for hash verification
  const secretKey = await getApiKey();
  
  // Compute expected hash: SHA256(secretKey + email)
  const hashInput = secretKey + email;
  const expectedHash = createHash('sha256').update(hashInput).digest('hex');
  
  // Compare hashes (case-insensitive for safety)
  if (emailhash.toLowerCase() !== expectedHash.toLowerCase()) {
    console.warn(`Email hash verification failed for email: ${email}`);
    return createResponse(401, { 
      error: 'Invalid email signature',
      message: 'The email signature is invalid. This request may have been tampered with.'
    });
  }
  
  console.log(`Email hash verified successfully for email: ${email}`);

  if (!isValidPhoneNumber(phoneNumber)) {
    return createResponse(400, { error: 'Invalid phone number format. Use E.164 format (e.g., +14155551234)' });
  }

  // Validate linkType
  if (linkType !== 'direct' && linkType !== 'universal') {
    return createResponse(400, { error: 'Invalid linkType. Must be "direct" or "universal"' });
  }

  const emailLower = email.toLowerCase();

  // Check if email is approved (same validation as email magic link flow)
  const isApproved = await isEmailApproved(emailLower);
  if (!isApproved) {
    return createResponse(403, { 
      error: 'Email not approved',
      message: 'This email is not approved for access. Please contact your administrator.'
    });
  }

  // Generate magic link token
  // Note: Don't create user profile here - only create after successful authentication
  const tokenId = `tok_ml_${randomBytes(16).toString('hex')}`;
  // Generate temporary userId for token (will be replaced with actual userId during verification)
  const tempUserId = await getUserIdForEmail(emailLower);
  const expiresAt = Math.floor(Date.now() / 1000) + 900; // 15 minutes

  // Store token in DynamoDB
  await docClient.send(new PutCommand({
    TableName: TOKENS_TABLE,
    Item: {
      tokenId,
      tokenType: 'magic_link',
      email: emailLower,
      phoneNumber,
      userId: tempUserId,
      deviceId: null,
      createdAt: Math.floor(Date.now() / 1000),
      expiresAt,
      used: false,
      usedAt: null,
      sessionJWT: null,
      metadata: {
        sourceFlow: 'sms',
        app: app || null
      }
    }
  }));

  // Build magic link based on linkType
  const magicLink = linkType === 'direct' 
    ? buildDirectSchemeUrl(tokenId, app)
    : buildRedirectUrl(tokenId, app);
  
  // Log magic link for debugging/workaround (especially when SNS isn't configured)
  console.log(`Generated magic link for SMS: ${magicLink} (tokenId: ${tokenId}, phoneNumber: ${phoneNumber})`);
  
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
    // Log failed login attempt
    const ipAddress = getIpAddress(event);
    await logActivity('failed_login', 'unknown', 'unknown', {
      reason: 'Invalid token',
      sourceFlow: 'unknown'
    }, deviceId, ipAddress);
    
    return createResponse(404, { error: 'Invalid or expired token' });
  }

  const tokenData = result.Item;

  // Validate token
  if (tokenData.tokenType !== 'magic_link') {
    const ipAddress = getIpAddress(event);
    await logActivity('failed_login', 'unknown', tokenData.email || 'unknown', {
      reason: 'Invalid token type',
      sourceFlow: tokenData.metadata?.sourceFlow || 'unknown'
    }, deviceId, ipAddress);
    
    return createResponse(400, { error: 'Invalid token type' });
  }

  if (tokenData.used) {
    const ipAddress = getIpAddress(event);
    await logActivity('failed_login', 'unknown', tokenData.email || 'unknown', {
      reason: 'Token already used',
      sourceFlow: tokenData.metadata?.sourceFlow || 'unknown'
    }, deviceId, ipAddress);
    
    return createResponse(400, { error: 'Token already used' });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > tokenData.expiresAt) {
    const ipAddress = getIpAddress(event);
    await logActivity('failed_login', 'unknown', tokenData.email || 'unknown', {
      reason: 'Token expired',
      sourceFlow: tokenData.metadata?.sourceFlow || 'unknown'
    }, deviceId, ipAddress);
    
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

  // Lazy provision user profile - only create when they actually authenticate
  // This is the first time we're certain the user has successfully authenticated
  const user = await getOrCreateUserProfile(tokenData.email, tokenData.metadata?.sourceFlow || 'email');

  // Check if user is deactivated
  const isDeactivated = await checkUserDeactivated(user.userId);
  if (isDeactivated) {
    const ipAddress = getIpAddress(event);
    await logActivity('failed_login', user.userId, user.email, {
      reason: 'User is deactivated',
      sourceFlow: tokenData.metadata?.sourceFlow || 'email'
    }, deviceId, ipAddress);
    
    return createResponse(403, { 
      error: 'Account deactivated',
      message: 'Your account has been deactivated. Please contact your administrator.'
    });
  }

  // Check user expiration
  const expirationCheck = await validateUserExpiration(user.userId);
  if (expirationCheck.expired) {
    const ipAddress = getIpAddress(event);
    await logActivity('failed_login', user.userId, user.email, {
      reason: expirationCheck.reason || 'Account expired',
      sourceFlow: tokenData.metadata?.sourceFlow || 'email'
    }, deviceId, ipAddress);
    
    return createResponse(403, { 
      error: 'Account expired',
      message: expirationCheck.reason || 'Your account has expired. Please contact your administrator.'
    });
  }

  // Generate session JWT
  const sessionExpiresAt = now + (30 * 24 * 60 * 60); // 30 days
  const sessionToken = await generateSessionJWT({
    userId: user.userId,
    email: user.email,
    role: user.role,
    deviceId,
    expiresAt: sessionExpiresAt
  });

  // Store session in DynamoDB (use actual userId from user profile, not temporary token userId)
  const sessionId = `ses_${randomBytes(16).toString('hex')}`;
  await docClient.send(new PutCommand({
    TableName: TOKENS_TABLE,
    Item: {
      tokenId: sessionId,
      tokenType: 'session',
      email: user.email,
      userId: user.userId, // Use actual userId from user profile
      deviceId,
      createdAt: now,
      expiresAt: sessionExpiresAt,
      used: true,
      usedAt: now,
      sessionJWT: sessionToken,
      metadata: {
        sourceFlow: tokenData.metadata?.sourceFlow || 'unknown',
        app: tokenData.metadata?.app || null,
        lastUsedAt: now
      }
    }
  }));

  // Log successful login
  const ipAddress = getIpAddress(event);
  await logActivityAndUpdateLastActive(
    'login',
    user.userId,
    user.email,
    {
      sourceFlow: tokenData.metadata?.sourceFlow || 'email',
      app: tokenData.metadata?.app || null
    },
    deviceId,
    ipAddress
  );

  return createResponse(200, {
    success: true,
    token: sessionToken,
    expiresAt: sessionExpiresAt,
    user: {
      userId: user.userId,
      email: user.email,
      role: user.role
    },
    app: tokenData.metadata?.app || null
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
    
    // Check if user is deactivated
    const isDeactivated = await checkUserDeactivated(decoded.userId);
    if (isDeactivated) {
      return createResponse(403, { 
        error: 'Account deactivated',
        message: 'Your account has been deactivated. Please contact your administrator.'
      });
    }

    // Check user expiration
    const expirationCheck = await validateUserExpiration(decoded.userId, decoded.exp);
    if (expirationCheck.expired) {
      return createResponse(403, { 
        error: 'Account expired',
        message: expirationCheck.reason || 'Your account has expired. Please contact your administrator.'
      });
    }
    
    // Check if token is close to expiry (within 7 days)
    const timeUntilExpiry = decoded.exp - now;
    if (timeUntilExpiry > 7 * 24 * 60 * 60) {
      // Update last active time even if not refreshing token
      await logActivityAndUpdateLastActive(
        'token_refresh',
        decoded.userId,
        decoded.email,
        { action: 'no_refresh_needed' },
        decoded.deviceId,
        getIpAddress(event)
      );
      
      return createResponse(200, {
        success: true,
        message: 'Token still valid, no refresh needed',
        token,
        expiresAt: decoded.exp
      });
    }

    // Get user profile to include current role in refreshed token
    const userProfile = await getUserProfile(decoded.userId);
    // If user profile doesn't exist (shouldn't happen, but handle gracefully)
    // Validate role from token or use default
    const role = validateRole(userProfile?.role || decoded.role) || 'basic';

    // Generate new session JWT
    const sessionExpiresAt = now + (30 * 24 * 60 * 60); // 30 days
    const newToken = await generateSessionJWT({
      userId: decoded.userId,
      email: decoded.email,
      role: role,
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

    // Update last active time
    await logActivityAndUpdateLastActive(
      'token_refresh',
      decoded.userId,
      decoded.email,
      { action: 'token_refreshed' },
      decoded.deviceId,
      getIpAddress(event)
    );

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
  console.log('[isEmailApproved] Checking approval for email:', email);
  const emailLower = email.toLowerCase();

  // Auto-approve Sigma emails
  if (emailLower.endsWith('@sigmacomputing.com')) {
    console.log('[isEmailApproved] Email is Sigma domain, auto-approved');
    return true;
  }

  // Check approved emails table
  console.log('[isEmailApproved] Checking approved emails table:', APPROVED_EMAILS_TABLE);
  try {
    const result = await docClient.send(new GetCommand({
      TableName: APPROVED_EMAILS_TABLE,
      Key: { email: emailLower }
    }));

    console.log('[isEmailApproved] DynamoDB query result:', result.Item ? 'Found item' : 'No item found');

    if (!result.Item) {
      console.log('[isEmailApproved] Email not found in approved emails table');
      return false;
    }

    // Check if approval has expiration date
    if (result.Item.expiresAt) {
      const now = Math.floor(Date.now() / 1000);
      const isNotExpired = now < result.Item.expiresAt;
      console.log('[isEmailApproved] Email has expiration date:', result.Item.expiresAt, 'now:', now, 'isNotExpired:', isNotExpired);
      return isNotExpired;
    }

    console.log('[isEmailApproved] Email approved (no expiration)');
    return true;
  } catch (error) {
    console.error('[isEmailApproved] Error checking email approval:', error);
    console.error('[isEmailApproved] Error details:', error instanceof Error ? error.message : String(error));
    console.error('[isEmailApproved] Error stack:', error instanceof Error ? error.stack : 'No stack');
    if (error instanceof Error) {
      console.error('[isEmailApproved] Error name:', error.name);
      console.error('[isEmailApproved] Error code:', (error as any).code);
    }
    // Re-throw to let caller handle it
    throw error;
  }
}

/**
 * Get or create user profile with lazy provisioning
 * Returns user object with userId, email, and role
 * Only call this after successful authentication (token verification)
 */
async function getOrCreateUserProfile(email: string, registrationMethod: string = 'email'): Promise<{ userId: string; email: string; role: string }> {
  const emailLower = email.toLowerCase();
  
  // First, try to find existing user by email using email-index GSI
  const queryResult = await docClient.send(new QueryCommand({
    TableName: USERS_TABLE,
    IndexName: 'email-index',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: { ':email': emailLower },
    Limit: 1
  }));

  if (queryResult.Items && queryResult.Items.length > 0) {
    // User exists, validate and return their profile
    const user = queryResult.Items[0];
    const role = validateRole(user.role) || 'basic';
    
    // Update registration method if not set
    if (!user.registrationMethod) {
      await docClient.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { userId: user.userId },
        UpdateExpression: 'SET registrationMethod = :method',
        ExpressionAttributeValues: { ':method': registrationMethod }
      }));
    }
    
    return {
      userId: user.userId,
      email: user.email,
      role: role
    };
  }

  // User doesn't exist - lazy provisioning: create new user profile
  // Check whitelist for role and expiration
  let userRole = 'basic';
  let expirationDate: number | undefined = undefined;
  
  // Check whitelist if not a Sigma email
  if (!emailLower.endsWith('@sigmacomputing.com')) {
    try {
      const whitelistResult = await docClient.send(new GetCommand({
        TableName: APPROVED_EMAILS_TABLE,
        Key: { email: emailLower }
      }));

      if (whitelistResult.Item) {
        // Check if whitelist entry has expired
        if (whitelistResult.Item.expiresAt) {
          const now = Math.floor(Date.now() / 1000);
          if (now >= whitelistResult.Item.expiresAt) {
            throw new Error('Whitelist entry has expired');
          }
          // Set user expiration to whitelist expiration
          expirationDate = whitelistResult.Item.expiresAt;
        }
        
        // Use role from whitelist if specified
        if (whitelistResult.Item.role) {
          userRole = validateRole(whitelistResult.Item.role) || 'basic';
        }
        
        // Mark user as registered in whitelist
        const now = Math.floor(Date.now() / 1000);
        await docClient.send(new UpdateCommand({
          TableName: APPROVED_EMAILS_TABLE,
          Key: { email: emailLower },
          UpdateExpression: 'SET registeredAt = :now',
          ExpressionAttributeValues: { ':now': now }
        }));
      }
    } catch (error) {
      console.error('Error checking whitelist:', error);
      // Continue with default role if whitelist check fails
    }
  }

  const userId = `usr_${randomBytes(8).toString('hex')}`;
  const now = Math.floor(Date.now() / 1000);

  const userItem: any = {
    userId,
    email: emailLower,
    role: userRole,
    registrationMethod,
    createdAt: now,
    updatedAt: now
  };

  if (expirationDate) {
    userItem.expirationDate = expirationDate;
  }

  await docClient.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: userItem
  }));

  console.log(`Created new user profile: ${userId} (${emailLower}) with role: ${userRole}${expirationDate ? `, expires: ${expirationDate}` : ''}`);

  return {
    userId,
    email: emailLower,
    role: userRole
  };
}

// validateRole and getUserProfile are now imported from shared/user-validation

/**
 * Get user ID for email (without creating profile)
 * This is used only for token storage - actual user profile is created during verification
 * Try to find existing userId from tokens, otherwise generate a temporary one
 */
async function getUserIdForEmail(email: string): Promise<string> {
  console.log('[getUserIdForEmail] Looking up userId for email:', email);
  console.log('[getUserIdForEmail] Using TOKENS_TABLE:', TOKENS_TABLE);
  
  try {
    // Query for existing sessions/tokens for this email to get userId
    console.log('[getUserIdForEmail] Querying DynamoDB with email-index...');
    const result = await docClient.send(new QueryCommand({
      TableName: TOKENS_TABLE,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email.toLowerCase() },
      Limit: 1
    }));

    console.log('[getUserIdForEmail] Query result items count:', result.Items?.length || 0);

    if (result.Items && result.Items.length > 0) {
      const userId = result.Items[0].userId;
      console.log('[getUserIdForEmail] Found existing userId:', userId);
      return userId;
    }
    
    console.log('[getUserIdForEmail] No existing tokens found, will generate new userId');
  } catch (error) {
    console.error('[getUserIdForEmail] Error querying for userId by email:', error);
    console.error('[getUserIdForEmail] Error details:', error instanceof Error ? error.message : String(error));
    console.error('[getUserIdForEmail] Error stack:', error instanceof Error ? error.stack : 'No stack');
    if (error instanceof Error) {
      console.error('[getUserIdForEmail] Error name:', error.name);
      console.error('[getUserIdForEmail] Error code:', (error as any).code);
    }
    // Fall through to generate new userId
  }

  // No existing tokens - generate temporary userId (will be replaced during verification)
  const newUserId = `usr_${randomBytes(8).toString('hex')}`;
  console.log('[getUserIdForEmail] Generated new temporary userId:', newUserId);
  return newUserId;
}

/**
 * Build direct custom scheme URL (for Expo Go / development)
 * Format: bigbuys://auth?token=xxx&app=dashboard
 */
function buildDirectSchemeUrl(tokenId: string, app: string | null): string {
  let url = `${APP_DEEP_LINK_SCHEME}://auth?token=${encodeURIComponent(tokenId)}`;
  if (app) {
    url += `&app=${encodeURIComponent(app)}`;
  }
  return url;
}

/**
 * Build HTTPS redirect URL that will redirect to deep link
 * This works better in email clients than direct deep links
 * Format: https://mobile.bigbuys.io/auth/verify?token=xxx&app=dashboard
 */
function buildRedirectUrl(tokenId: string, app: string | null): string {
  let url = `${REDIRECT_BASE_URL}/auth/verify?token=${encodeURIComponent(tokenId)}`;
  if (app) {
    url += `&app=${encodeURIComponent(app)}`;
  }
  return url;
}

/**
 * Generate session JWT
 */
async function generateSessionJWT(payload: {
  userId: string;
  email: string;
  role: string;
  deviceId: string;
  expiresAt: number;
}): Promise<string> {
  const secret = await getJWTSecret();
  
  return jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
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
        Text: { Data: `Sign in to Big Buys Mobile: ${magicLink}\n\nClick this link to open the app and sign in. This link expires in 15 minutes.` }
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

  // Log the magic link for debugging/workaround when SNS isn't configured
  console.log(`Magic link SMS would be sent to ${phoneNumber}: ${magicLink}`);

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

  // Trim whitespace (Secrets Manager sometimes includes trailing newlines)
  apiKey = (result.SecretString || '').trim();
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