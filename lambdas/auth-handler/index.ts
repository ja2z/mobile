/**
 * Mobile App Authentication Lambda Handler
 * Handles email magic links, SMS magic links, token verification, and session management
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { validateUserExpiration, checkUserDeactivated, getUserProfile, validateRole } from '../shared/user-validation';
import { logActivity, logActivityAndUpdateLastActive, getActivityLogEmail } from '../shared/activity-logger';
import { isEmailApproved as checkEmailApproved, getApprovedEmail, setRegisteredAtIfNotExists } from '../shared/approved-emails-service';
import { getUserProfileByEmail, createUser, updateUser } from '../shared/user-service';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sesClient = new SESClient({});
const secretsClient = new SecretsManagerClient({});

// Environment variables
const TOKENS_TABLE = process.env.TOKENS_TABLE || 'mobile-auth-tokens';
// APPROVED_EMAILS_TABLE and USERS_TABLE removed - now using Postgres services
const JWT_SECRET_NAME = process.env.JWT_SECRET_NAME || 'mobile-app/jwt-secret';
const API_KEY_SECRET_NAME = process.env.API_KEY_SECRET_NAME || 'mobile-app/api-key';
const BACKDOOR_SECRET_NAME = process.env.BACKDOOR_SECRET_NAME || 'mobile-app/backdoor-secret';
const TELNYX_API_KEY_SECRET_NAME = process.env.TELNYX_API_KEY_SECRET_NAME || 'mobile-app/telnyx-api-key';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@sigmacomputing.com';
const FROM_NAME = process.env.FROM_NAME || null;
const APP_DEEP_LINK_SCHEME = process.env.APP_DEEP_LINK_SCHEME || 'bigbuys';
const REDIRECT_BASE_URL = process.env.REDIRECT_BASE_URL || 'https://mobile.bigbuys.io';
const ACTIVITY_TABLE = process.env.ACTIVITY_TABLE || 'mobile-user-activity';
const SHORT_URLS_TABLE = process.env.SHORT_URLS_TABLE || 'mobile-short-urls';

// Cache for secrets (reduces Secrets Manager calls)
let jwtSecret: string | null = null;
let apiKey: string | null = null;
let backdoorSecret: string | null = null;
let telnyxApiKey: string | null = null;

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
    } else if (path === '/v1/auth/authenticate-backdoor' && method === 'POST') {
      return await handleAuthenticateBackdoor(body, event);
    } else if (path.startsWith('/s/') && method === 'GET') {
      // Handle /s/{shortId} (API Gateway strips /v1/ prefix in AWS_PROXY mode when accessed via CloudFront)
      const shortId = path.replace('/s/', '');
      if (shortId) {
        // Check if this is a resolve request (for app to get fullUrl as JSON)
        const queryParams = event.queryStringParameters || {};
        if (queryParams.resolve === 'true') {
          return await handleShortUrlResolve(shortId, event);
        }
        return await handleShortUrlRedirect(shortId, event);
      } else {
        return createResponse(400, { error: 'Short ID is required' });
      }
    } else if (path.startsWith('/v1/s/') && method === 'GET') {
      // Handle /v1/s/{shortId}/resolve for resolve endpoint
      const pathParts = path.replace('/v1/s/', '').split('/');
      const shortId = pathParts[0];
      if (pathParts[1] === 'resolve' && shortId) {
        return await handleShortUrlResolve(shortId, event);
      } else if (shortId) {
        const queryParams = event.queryStringParameters || {};
        if (queryParams.resolve === 'true') {
          return await handleShortUrlResolve(shortId, event);
        }
        return await handleShortUrlRedirect(shortId, event);
      } else {
        return createResponse(400, { error: 'Short ID is required' });
      }
    } else if (path.startsWith('/v1/auth/s/') && method === 'GET') {
      // Legacy support for /v1/auth/s/{shortId} (if accessed directly via API Gateway)
      const shortId = path.replace('/v1/auth/s/', '');
      if (shortId) {
        return await handleShortUrlRedirect(shortId, event);
      } else {
        return createResponse(400, { error: 'Short ID is required' });
      }
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
 * Check if user (by email) is expired or deactivated
 * @param email - Email address to check
 * @returns Object with blocked status, reason, and userId if blocked
 */
async function checkUserStatusByEmail(email: string): Promise<{ 
  blocked: boolean; 
  reason?: string; 
  userId?: string 
}> {
  const user = await getUserProfileByEmail(email);
  if (!user) {
    return { blocked: false }; // New user, allow through
  }
  
  // Check deactivation first
  if (user.isDeactivated) {
    return { blocked: true, reason: 'User is deactivated', userId: user.userId };
  }
  
  // Check expiration
  if (user.expirationDate) {
    const now = Math.floor(Date.now() / 1000);
    if (now >= user.expirationDate) {
      return { blocked: true, reason: 'User account has expired', userId: user.userId };
    }
  }
  
  return { blocked: false, userId: user.userId };
}

/**
 * Handle email magic link request (self-service registration)
 */
async function handleRequestMagicLink(body: any, event?: any) {
  console.log('[handleRequestMagicLink] Starting magic link request');
  console.log('[handleRequestMagicLink] Body:', JSON.stringify(body));
  console.log('[handleRequestMagicLink] Event keys:', Object.keys(event || {}));
  
  try {
    const { email, linkType = 'universal', usernameHash } = body; // Default to 'universal' for backward compatibility
    console.log('[handleRequestMagicLink] Extracted email:', email, 'linkType:', linkType, 'usernameHash:', usernameHash ? usernameHash.substring(0, 16) + '...' : 'none');

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

    // Check for backdoor user (for @sigmacomputing.com emails with usernameHash)
    const BACKDOOR_HASH = '41c16a8e3648d17965306295b3c6ae049aa6da5be6d609c5b5de2f6a044925d5';
    if (emailLower.endsWith('@sigmacomputing.com') && usernameHash) {
      console.log('[handleRequestMagicLink] Checking if username hash matches backdoor hash...');
      if (usernameHash.toLowerCase() === BACKDOOR_HASH.toLowerCase()) {
        console.log('[handleRequestMagicLink] Backdoor user detected, returning requiresBackdoorAuth');
        return createResponse(200, {
          success: true,
          requiresBackdoorAuth: true,
          message: 'Backdoor authentication required'
        });
      }
      console.log('[handleRequestMagicLink] Username hash does not match backdoor hash, proceeding with magic link flow');
    }

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

    // Check if user is expired or deactivated (before sending magic link)
    console.log('[handleRequestMagicLink] Checking user status...');
    const userStatusCheck = await checkUserStatusByEmail(emailLower);
    if (userStatusCheck.blocked) {
      console.log('[handleRequestMagicLink] User is blocked:', userStatusCheck.reason);
      // Log failed login attempt
      try {
        const ipAddress = event ? getIpAddress(event) : undefined;
        await logActivity('failed_login', userStatusCheck.userId || 'unknown', emailLower, {
          reason: userStatusCheck.reason === 'User account has expired' ? 'Account expired' : 'User is deactivated',
          sourceFlow: 'email'
        }, undefined, ipAddress);
      } catch (activityError) {
        console.error('[handleRequestMagicLink] Failed to log activity:', activityError);
      }
      
      // Return appropriate error message
      const errorMessage = userStatusCheck.reason === 'User account has expired'
        ? 'Your account has expired. Please contact your administrator.'
        : 'Your account has been deactivated. Please contact your administrator.';
      
      return createResponse(403, {
        error: userStatusCheck.reason === 'User account has expired' ? 'Account expired' : 'Account deactivated',
        message: errorMessage
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
    console.log('[handleRequestMagicLink] Email details:', { 
      to: emailLower, 
      from: FROM_EMAIL, 
      fromName: FROM_NAME,
      magicLink: magicLink.substring(0, 100) + '...' 
    });
    try {
      await sendMagicLinkEmail(emailLower, magicLink);
      console.log('[handleRequestMagicLink] Magic link email sent successfully');
    } catch (error) {
      console.error('[handleRequestMagicLink] ========== EMAIL SEND ERROR ==========');
      console.error('[handleRequestMagicLink] Error sending magic link email:', error);
      console.error('[handleRequestMagicLink] Error type:', typeof error);
      console.error('[handleRequestMagicLink] Error details:', error instanceof Error ? error.message : String(error));
      console.error('[handleRequestMagicLink] Error stack:', error instanceof Error ? error.stack : 'No stack');
      if (error instanceof Error) {
        console.error('[handleRequestMagicLink] Error name:', error.name);
        console.error('[handleRequestMagicLink] Error code:', (error as any).code);
        console.error('[handleRequestMagicLink] Error statusCode:', (error as any).statusCode);
        console.error('[handleRequestMagicLink] Error requestId:', (error as any).requestId);
      }
      console.error('[handleRequestMagicLink] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      console.error('[handleRequestMagicLink] ========================================');
      
      // Provide more specific error message
      let errorMessage = 'Failed to send magic link email. Please try again later.';
      if (error instanceof Error) {
        const errorCode = (error as any).code;
        const errorName = error.name;
        if (errorCode === 'MessageRejected' || errorName === 'MessageRejected') {
          errorMessage = 'Email address is not verified or rejected. Please contact support.';
        } else if (errorCode === 'MailFromDomainNotVerified' || errorName === 'MailFromDomainNotVerified') {
          errorMessage = 'Email service configuration error. Please contact support.';
        } else if (error.message) {
          errorMessage = `Email send failed: ${error.message}`;
        }
      }
      
      return createResponse(500, { 
        error: 'Internal server error',
        message: errorMessage,
        debug: process.env.NODE_ENV === 'development' ? {
          errorName: error instanceof Error ? error.name : undefined,
          errorCode: (error as any)?.code,
          errorMessage: error instanceof Error ? error.message : String(error)
        } : undefined
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
  const { email, phoneNumber, app, linkType = 'universal', emailhash, pageId, variables } = body;

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

  // Check if user is expired or deactivated (before sending magic link)
  console.log('[handleSendToMobile] Checking user status...');
  const userStatusCheck = await checkUserStatusByEmail(emailLower);
  if (userStatusCheck.blocked) {
    console.log('[handleSendToMobile] User is blocked:', userStatusCheck.reason);
    // Log failed login attempt
    try {
      const ipAddress = getIpAddress(event);
      await logActivity('failed_login', userStatusCheck.userId || 'unknown', emailLower, {
        reason: userStatusCheck.reason === 'User account has expired' ? 'Account expired' : 'User is deactivated',
        sourceFlow: 'sms'
      }, undefined, ipAddress);
    } catch (activityError) {
      console.error('[handleSendToMobile] Failed to log activity:', activityError);
    }
    
    // Return appropriate error message
    const errorMessage = userStatusCheck.reason === 'User account has expired'
      ? 'Your account has expired. Please contact your administrator.'
      : 'Your account has been deactivated. Please contact your administrator.';
    
    return createResponse(403, {
      error: userStatusCheck.reason === 'User account has expired' ? 'Account expired' : 'Account deactivated',
      message: errorMessage
    });
  }

  // Generate magic link token
  // Note: Don't create user profile here - only create after successful authentication
  const tokenId = `tok_ml_${randomBytes(16).toString('hex')}`;
  // Generate temporary userId for token (will be replaced with actual userId during verification)
  const tempUserId = await getUserIdForEmail(emailLower);
  const expiresAt = Math.floor(Date.now() / 1000) + 900; // 15 minutes

  // Validate that pageId and variables are only used when app is specified
  if ((pageId || variables) && !app) {
    return createResponse(400, { 
      error: 'Invalid request',
      message: 'pageId and variables can only be used when app is specified'
    });
  }

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
        app: app || null,
        pageId: (app && pageId) ? pageId : null,
        variables: (app && variables) ? variables : null
      }
    }
  }));

  // Build magic link based on linkType
  const fullMagicLink = linkType === 'direct' 
    ? buildDirectSchemeUrl(tokenId, app, pageId, variables)
    : buildRedirectUrl(tokenId, app, pageId, variables);
  
  // Create short URL for SMS (cleaner appearance in SMS)
  let magicLink: string;
  try {
    magicLink = await createShortUrl(fullMagicLink, tokenId);
    console.log(`[handleSendToMobile] Created short URL for SMS: ${magicLink} (full URL: ${fullMagicLink.substring(0, 100)}...)`);
  } catch (error: any) {
    console.error(`[handleSendToMobile] Failed to create short URL, using full URL:`, error);
    // Fallback to full URL if short URL creation fails
    magicLink = fullMagicLink;
  }
  
  // Log magic link for debugging
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
    
    return createResponse(400, { 
      error: 'Token already used',
      email: tokenData.email // Include email in error response
    });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > tokenData.expiresAt) {
    const ipAddress = getIpAddress(event);
    await logActivity('failed_login', 'unknown', tokenData.email || 'unknown', {
      reason: 'Token expired',
      sourceFlow: tokenData.metadata?.sourceFlow || 'unknown'
    }, deviceId, ipAddress);
    
    return createResponse(400, { 
      error: 'Token expired',
      email: tokenData.email // Include email in error response
    });
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
  // SECURITY: This will now block registration if user is not actively whitelisted
  let user;
  try {
    user = await getOrCreateUserProfile(tokenData.email, tokenData.metadata?.sourceFlow || 'email');
  } catch (error) {
    // Handle different types of errors with appropriate responses
    if (error instanceof Error) {
      const ipAddress = getIpAddress(event);
      
      // User account expired or deactivated (corner case: admin changed expiration after magic link sent)
      if (error.message.includes('User account has expired') || error.message.includes('User is deactivated')) {
        // Try to get userId for logging
        let userId = 'unknown';
        try {
          const existingUser = await getUserProfileByEmail(tokenData.email);
          if (existingUser) {
            userId = existingUser.userId;
          }
        } catch (e) {
          // Ignore - we'll use 'unknown'
        }
        
        await logActivity('failed_login', userId, tokenData.email || 'unknown', {
          reason: error.message.includes('deactivated') ? 'User is deactivated' : 'Account expired',
          sourceFlow: tokenData.metadata?.sourceFlow || 'unknown'
        }, deviceId, ipAddress);
        
        const errorMessage = error.message.includes('deactivated')
          ? 'Your account has been deactivated. Please contact your administrator.'
          : 'Your account has expired. Please contact your administrator.';
        
        return createResponse(403, {
          error: error.message.includes('deactivated') ? 'Account deactivated' : 'Account expired',
          message: errorMessage
        });
      }
      
      // Whitelist validation errors - block registration
      if (error.message.includes('not approved') || 
          error.message.includes('not on the whitelist') ||
          error.message.includes('Whitelist entry has expired') ||
          error.message.includes('Unable to verify email approval')) {
        await logActivity('failed_login', 'unknown', tokenData.email || 'unknown', {
          reason: 'Registration blocked - not whitelisted',
          sourceFlow: tokenData.metadata?.sourceFlow || 'unknown',
          errorMessage: error.message
        }, deviceId, ipAddress);
        
        return createResponse(403, { 
          error: 'Registration not allowed',
          message: error.message || 'This email is not approved for access. Please contact your administrator.'
        });
      }
    }
    // Re-throw other errors (shouldn't happen, but be safe)
    throw error;
  }

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
  const sessionExpiresAt = now + (14 * 24 * 60 * 60); // 14 days
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

    // Generate new session JWT, preserving isBackdoor flag if present
    const sessionExpiresAt = now + (14 * 24 * 60 * 60); // 14 days
    const newToken = await generateSessionJWT({
      userId: decoded.userId,
      email: decoded.email,
      role: role,
      deviceId: decoded.deviceId,
      expiresAt: sessionExpiresAt,
      isBackdoor: decoded.isBackdoor || false
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
      getActivityLogEmail(decoded.email, decoded.isBackdoor),
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
 * Handle backdoor authentication (for development/testing)
 * Authenticates a specific email without requiring a magic link
 * Uses SHA-256 hash of username to verify access
 * Supports two-step validation: username hash first, then password hash
 */
async function handleAuthenticateBackdoor(body: any, event: any) {
  const { email, hash, deviceId, passwordHash } = body;
  const BACKDOOR_HASH = '41c16a8e3648d17965306295b3c6ae049aa6da5be6d609c5b5de2f6a044925d5';
  const BACKDOOR_PASSWORD_HASH = '29338cbd66e46f9b681b02102c10f97da48b75edfb2141c476935e28ff1eff28';
  const BACKDOOR_USER_DISPLAY = 'backdoor user';

  if (!email) {
    return createResponse(400, { error: 'Email is required' });
  }

  if (!hash) {
    return createResponse(400, { error: 'Hash is required' });
  }

  if (!deviceId) {
    return createResponse(400, { error: 'Device ID is required' });
  }

  const emailLower = email.toLowerCase();
  
  // Compare received hash to hardcoded hash (no computation on server)
  if (hash.toLowerCase() !== BACKDOOR_HASH.toLowerCase()) {
    const ipAddress = getIpAddress(event);
    // Use first 8 chars of hash for display name
    const displayName = hash.substring(0, 8);
    await logActivity('failed_login', 'unknown', displayName, {
      reason: 'Invalid backdoor hash',
      sourceFlow: 'backdoor'
    }, deviceId, ipAddress);
    
    return createResponse(403, { 
      error: 'Access denied',
      message: 'Invalid credentials'
    });
  }

  // If passwordHash is not provided, this is step 1 (username validation only)
  // Return success with requiresPassword flag, but don't issue JWT yet
  if (!passwordHash) {
    console.log('[handleAuthenticateBackdoor] Username validated, password required');
    return createResponse(200, {
      success: true,
      requiresPassword: true,
      message: 'Password required'
    });
  }

  // Step 2: Validate password hash
  if (passwordHash.toLowerCase() !== BACKDOOR_PASSWORD_HASH.toLowerCase()) {
    const ipAddress = getIpAddress(event);
    // Use first 8 chars of hash for display name
    const displayName = hash.substring(0, 8);
    await logActivity('failed_login', 'unknown', displayName, {
      reason: 'Invalid backdoor password hash',
      sourceFlow: 'backdoor'
    }, deviceId, ipAddress);
    
    return createResponse(403, { 
      error: 'Access denied',
      message: 'Invalid password'
    });
  }

  // Both username and password are valid - proceed with authentication
  // Use first 8 chars of hash as display name
  const displayName = hash.substring(0, 8);
  console.log('[handleAuthenticateBackdoor] Authenticating backdoor user');

  const now = Math.floor(Date.now() / 1000);

  // Get or create user profile
  let user;
  try {
    console.log('[handleAuthenticateBackdoor] Getting or creating user profile for:', emailLower);
    user = await getOrCreateUserProfile(emailLower, 'backdoor');
    console.log('[handleAuthenticateBackdoor] User profile retrieved/created:', { userId: user.userId, email: user.email, role: user.role });
  } catch (error) {
    // Handle expiration/deactivation errors specifically
    if (error instanceof Error && (
      error.message.includes('User account has expired') || 
      error.message.includes('User is deactivated')
    )) {
      // Try to get userId for logging
      let userId = 'unknown';
      try {
        const existingUser = await getUserProfileByEmail(emailLower);
        if (existingUser) {
          userId = existingUser.userId;
        }
      } catch (e) {
        // Ignore - we'll use 'unknown'
      }
      
      const ipAddress = getIpAddress(event);
      await logActivity('failed_login', userId, BACKDOOR_USER_DISPLAY, {
        reason: error.message.includes('deactivated') ? 'User is deactivated' : 'Account expired',
        sourceFlow: 'backdoor'
      }, deviceId, ipAddress);
      
      const errorMessage = error.message.includes('deactivated')
        ? 'Your account has been deactivated. Please contact your administrator.'
        : 'Your account has expired. Please contact your administrator.';
      
      return createResponse(403, {
        error: error.message.includes('deactivated') ? 'Account deactivated' : 'Account expired',
        message: errorMessage
      });
    }
    
    // Handle other errors (whitelist, etc.)
    console.error('[handleAuthenticateBackdoor] ERROR getting/creating user profile:', error);
    console.error('[handleAuthenticateBackdoor] Error type:', typeof error);
    console.error('[handleAuthenticateBackdoor] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[handleAuthenticateBackdoor] Error stack:', error instanceof Error ? error.stack : 'No stack');
    if (error instanceof Error) {
      console.error('[handleAuthenticateBackdoor] Error name:', error.name);
      console.error('[handleAuthenticateBackdoor] Error code:', (error as any).code);
    }
    
    const ipAddress = getIpAddress(event);
    await logActivity('failed_login', 'unknown', BACKDOOR_USER_DISPLAY, {
      reason: 'Failed to get/create user profile',
      sourceFlow: 'backdoor',
      errorMessage: error instanceof Error ? error.message : String(error)
    }, deviceId, ipAddress);
    
    return createResponse(500, { 
      error: 'Internal server error',
      message: 'Failed to authenticate. Please try again.'
    });
  }

  // Check if user is deactivated
  const isDeactivated = await checkUserDeactivated(user.userId);
  if (isDeactivated) {
    const ipAddress = getIpAddress(event);
    await logActivity('failed_login', user.userId, BACKDOOR_USER_DISPLAY, {
      reason: 'User is deactivated',
      sourceFlow: 'backdoor'
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
    await logActivity('failed_login', user.userId, BACKDOOR_USER_DISPLAY, {
      reason: expirationCheck.reason || 'Account expired',
      sourceFlow: 'backdoor'
    }, deviceId, ipAddress);
    
    return createResponse(403, { 
      error: 'Account expired',
      message: expirationCheck.reason || 'Your account has expired. Please contact your administrator.'
    });
  }

  // Generate session JWT with isBackdoor flag
  const sessionExpiresAt = now + (14 * 24 * 60 * 60); // 14 days
  const sessionToken = await generateSessionJWT({
    userId: user.userId,
    email: user.email,
    role: user.role,
    deviceId,
    expiresAt: sessionExpiresAt,
    isBackdoor: true // Mark as backdoor user
  });

  // Store session in DynamoDB
  const sessionId = `ses_${randomBytes(16).toString('hex')}`;
  await docClient.send(new PutCommand({
    TableName: TOKENS_TABLE,
    Item: {
      tokenId: sessionId,
      tokenType: 'session',
      email: user.email,
      userId: user.userId,
      deviceId,
      createdAt: now,
      expiresAt: sessionExpiresAt,
      used: true,
      usedAt: now,
      sessionJWT: sessionToken,
      metadata: {
        sourceFlow: 'backdoor',
        lastUsedAt: now
      }
    }
  }));

  // Log successful login (use "backdoor user" instead of email)
  const ipAddress = getIpAddress(event);
  await logActivityAndUpdateLastActive(
    'login',
    user.userId,
    BACKDOOR_USER_DISPLAY,
    {
      sourceFlow: 'backdoor',
      app: null
    },
    deviceId,
    ipAddress
  );

  console.log('[handleAuthenticateBackdoor] Backdoor authentication successful');

  return createResponse(200, {
    success: true,
    token: sessionToken,
    expiresAt: sessionExpiresAt,
    user: {
      userId: user.userId,
      email: user.email,
      role: user.role
    }
  });
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

  // Check approved emails table using Postgres service
  console.log('[isEmailApproved] Checking approved emails table via Postgres');
  try {
    const approved = await checkEmailApproved(emailLower);
    console.log('[isEmailApproved] Postgres query result:', approved ? 'Approved' : 'Not approved');
    return approved;
  } catch (error) {
    console.error('[isEmailApproved] Error checking email approval:', error);
    console.error('[isEmailApproved] Error details:', error instanceof Error ? error.message : String(error));
    console.error('[isEmailApproved] Error stack:', error instanceof Error ? error.stack : 'No stack');
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
  
  // First, try to find existing user by email using Postgres service
  const existingUser = await getUserProfileByEmail(emailLower);

  if (existingUser) {
    // User exists, validate and return their profile
    const role = validateRole(existingUser.role) || 'basic';
    
    // Check if user is expired BEFORE syncing from whitelist
    // This catches the corner case where admin manually set expiration to past
    // after user received magic link but before they clicked it
    if (existingUser.isDeactivated) {
      throw new Error('User is deactivated');
    }
    
    if (existingUser.expirationDate) {
      const now = Math.floor(Date.now() / 1000);
      if (now >= existingUser.expirationDate) {
        throw new Error('User account has expired');
      }
    }
    
    // Update registration method if not set
    if (!existingUser.registrationMethod) {
      await updateUser(existingUser.userId, { registrationMethod });
    }
    
    // Note: Whitelist expiration is only used pre-registration.
    // Once user is registered, only the users table expiration matters.
    // No sync logic needed here - user expiration is authoritative post-registration.
    
    return {
      userId: existingUser.userId,
      email: existingUser.email,
      role: role
    };
  }

  // User doesn't exist - lazy provisioning: create new user profile
  // SECURITY: For non-Sigma emails, registration is ONLY allowed if actively whitelisted
  // Check whitelist for role and expiration
  let userRole = 'basic';
  let expirationDate: number | undefined = undefined;
  
  // Check whitelist if not a Sigma email (Sigma emails bypass whitelist)
  if (!emailLower.endsWith('@sigmacomputing.com')) {
    try {
      const whitelistEmail = await getApprovedEmail(emailLower);

      // SECURITY FIX: Block registration if not actively whitelisted
      if (!whitelistEmail) {
        console.log(`[getOrCreateUserProfile] Registration blocked: ${emailLower} is not whitelisted`);
        throw new Error('Email not approved for registration. This email is not on the whitelist.');
      }

      // Check if whitelist entry has expired
      if (whitelistEmail.expirationDate) {
        const now = Math.floor(Date.now() / 1000);
        if (now >= whitelistEmail.expirationDate) {
          console.log(`[getOrCreateUserProfile] Registration blocked: ${emailLower} whitelist entry has expired`);
          throw new Error('Whitelist entry has expired. This email is no longer approved for access.');
        }
        // Set user expiration to whitelist expiration
        expirationDate = whitelistEmail.expirationDate;
      }
      
      // Use role from whitelist if specified
      if (whitelistEmail.role) {
        userRole = validateRole(whitelistEmail.role) || 'basic';
      }
      
      // Mark user as registered in whitelist (only set if not already set to preserve first registration time)
      const now = Math.floor(Date.now() / 1000);
      await setRegisteredAtIfNotExists(emailLower, now);
    } catch (error) {
      // Re-throw whitelist validation errors to block registration
      if (error instanceof Error && (
        error.message.includes('not approved') || 
        error.message.includes('expired')
      )) {
        console.error(`[getOrCreateUserProfile] Whitelist validation failed: ${error.message}`);
        throw error;
      }
      // For other errors (e.g., database errors), log and re-throw to be safe
      console.error('[getOrCreateUserProfile] Error checking whitelist:', error);
      throw new Error('Unable to verify email approval. Registration blocked for security.');
    }
  }

  const userId = `usr_${randomBytes(8).toString('hex')}`;

  await createUser({
    userId,
    email: emailLower,
    role: userRole,
    expirationDate,
    registrationMethod,
  });

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
 * Format: bigbuys://auth?token=xxx&app=dashboard&pageId=123abc&variables={"p_stockroom_qty":"100"}
 */
function buildDirectSchemeUrl(tokenId: string, app: string | null, pageId?: string, variables?: Record<string, string>): string {
  let url = `${APP_DEEP_LINK_SCHEME}://auth?token=${encodeURIComponent(tokenId)}`;
  if (app) {
    url += `&app=${encodeURIComponent(app)}`;
  }
  if (app && pageId) {
    url += `&pageId=${encodeURIComponent(pageId)}`;
  }
  if (app && variables) {
    url += `&variables=${encodeURIComponent(JSON.stringify(variables))}`;
  }
  return url;
}

/**
 * Build HTTPS redirect URL that will redirect to deep link
 * This works better in email clients than direct deep links
 * Format: https://mobile.bigbuys.io/auth/verify?token=xxx&app=dashboard&pageId=123abc&variables={"p_stockroom_qty":"100"}
 */
function buildRedirectUrl(tokenId: string, app: string | null, pageId?: string, variables?: Record<string, string>): string {
  let url = `${REDIRECT_BASE_URL}/auth/verify?token=${encodeURIComponent(tokenId)}`;
  if (app) {
    url += `&app=${encodeURIComponent(app)}`;
  }
  if (app && pageId) {
    url += `&pageId=${encodeURIComponent(pageId)}`;
  }
  if (app && variables) {
    url += `&variables=${encodeURIComponent(JSON.stringify(variables))}`;
  }
  return url;
}

/**
 * Generate a short ID (6 characters) using base62 encoding
 * Uses alphanumeric characters (0-9, a-z, A-Z) for URL-safe IDs
 */
function generateShortId(): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // Generate 6 random bytes and convert to base62
  const bytes = randomBytes(6);
  let result = '';
  
  // Convert each byte to base62
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    result += chars[byte % 62];
  }
  
  return result;
}

/**
 * Create a short URL mapping in DynamoDB
 * Returns the short URL (e.g., https://mobile.bigbuys.io/s/abc123)
 */
async function createShortUrl(fullUrl: string, tokenId: string): Promise<string> {
  const maxRetries = 5;
  let shortId: string = '';
  let retries = 0;
  
  // Generate short ID and check for collisions
  while (retries < maxRetries) {
    shortId = generateShortId();
    
    try {
      // Check if shortId already exists
      const existing = await docClient.send(new GetCommand({
        TableName: SHORT_URLS_TABLE,
        Key: { shortId }
      }));
      
      if (!existing.Item) {
        // Short ID is available, use it
        break;
      }
      
      // Collision detected, retry
      retries++;
      console.log(`[createShortUrl] Collision detected for shortId: ${shortId}, retrying... (${retries}/${maxRetries})`);
      
      if (retries >= maxRetries) {
        throw new Error('Failed to generate unique short ID after maximum retries');
      }
    } catch (error: any) {
      // If error is not a collision (e.g., table doesn't exist), throw it
      if (error.name === 'ResourceNotFoundException') {
        throw new Error(`DynamoDB table ${SHORT_URLS_TABLE} does not exist. Please run setup-short-urls-table.sh first.`);
      }
      throw error;
    }
  }
  
  // Ensure shortId was assigned (TypeScript safety check)
  if (!shortId) {
    throw new Error('Failed to generate short ID');
  }
  
  // Store mapping in DynamoDB with 15-minute TTL
  const expiresAt = Math.floor(Date.now() / 1000) + 900; // 15 minutes
  await docClient.send(new PutCommand({
    TableName: SHORT_URLS_TABLE,
    Item: {
      shortId,
      fullUrl,
      tokenId,
      createdAt: Math.floor(Date.now() / 1000),
      expiresAt
    }
  }));
  
  const shortUrl = `${REDIRECT_BASE_URL}/s/${shortId}`;
  console.log(`[createShortUrl] Created short URL mapping: ${shortUrl} -> ${fullUrl.substring(0, 100)}...`);
  
  return shortUrl;
}

/**
 * Handle short URL resolve (returns JSON with fullUrl)
 * Used by the app to resolve short URLs when received via universal links
 */
async function handleShortUrlResolve(shortId: string, event: any) {
  console.log(`[handleShortUrlResolve] Looking up shortId: ${shortId}`);
  
  try {
    const result = await docClient.send(new GetCommand({
      TableName: SHORT_URLS_TABLE,
      Key: { shortId }
    }));
    
    if (!result.Item) {
      console.log(`[handleShortUrlResolve] Short ID not found: ${shortId}`);
      return createResponse(404, { 
        error: 'Link not found',
        message: 'This link may have expired or is invalid. Please request a new sign-in link.'
      });
    }
    
    const { fullUrl, expiresAt } = result.Item;
    
    // Check if expired (though TTL should handle this, we check for safety)
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt && now > expiresAt) {
      console.log(`[handleShortUrlResolve] Short ID expired: ${shortId}`);
      return createResponse(404, { 
        error: 'Link expired',
        message: 'This link has expired. Please request a new sign-in link.'
      });
    }
    
    console.log(`[handleShortUrlResolve] Resolved ${shortId} to: ${fullUrl.substring(0, 100)}...`);
    
    // Return JSON with fullUrl
    return createResponse(200, {
      success: true,
      fullUrl
    });
  } catch (error: any) {
    console.error(`[handleShortUrlResolve] Error looking up shortId ${shortId}:`, error);
    
    if (error.name === 'ResourceNotFoundException') {
      return createResponse(500, { 
        error: 'Service configuration error',
        message: 'Short URL service is not properly configured. Please contact support.'
      });
    }
    
    return createResponse(500, { 
      error: 'Internal server error',
      message: 'Failed to resolve short URL. Please try again.'
    });
  }
}

/**
 * Handle short URL redirect
 * Looks up shortId in DynamoDB and redirects to fullUrl
 */
async function handleShortUrlRedirect(shortId: string, event: any) {
  console.log(`[handleShortUrlRedirect] Looking up shortId: ${shortId}`);
  
  try {
    const result = await docClient.send(new GetCommand({
      TableName: SHORT_URLS_TABLE,
      Key: { shortId }
    }));
    
    if (!result.Item) {
      console.log(`[handleShortUrlRedirect] Short ID not found: ${shortId}`);
      return createResponse(404, { 
        error: 'Link not found',
        message: 'This link may have expired or is invalid. Please request a new sign-in link.'
      });
    }
    
    const { fullUrl, expiresAt } = result.Item;
    
    // Check if expired (though TTL should handle this, we check for safety)
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt && now > expiresAt) {
      console.log(`[handleShortUrlRedirect] Short ID expired: ${shortId}`);
      return createResponse(404, { 
        error: 'Link expired',
        message: 'This link has expired. Please request a new sign-in link.'
      });
    }
    
    console.log(`[handleShortUrlRedirect] Redirecting ${shortId} to: ${fullUrl.substring(0, 100)}...`);
    
    // Use simple 302 redirect to the fullUrl
    // If fullUrl is a universal link (/auth/verify?token=...), iOS will handle it properly
    // This matches the original pre-shortening flow where SMS links went directly to /auth/verify
    // The key is that /auth/verify is configured as a universal link in apple-app-site-association
    return {
      statusCode: 302,
      headers: {
        'Location': fullUrl,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: ''
    };
  } catch (error: any) {
    console.error(`[handleShortUrlRedirect] Error looking up shortId ${shortId}:`, error);
    
    if (error.name === 'ResourceNotFoundException') {
      return createResponse(500, { 
        error: 'Service configuration error',
        message: 'Short URL service is not properly configured. Please contact support.'
      });
    }
    
    return createResponse(500, { 
      error: 'Internal server error',
      message: 'Failed to process redirect. Please try again.'
    });
  }
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
  isBackdoor?: boolean;
}): Promise<string> {
  const secret = await getJWTSecret();
  
  const jwtPayload: any = {
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    deviceId: payload.deviceId,
    iat: Math.floor(Date.now() / 1000),
    exp: payload.expiresAt
  };
  
  // Include isBackdoor flag if present
  if (payload.isBackdoor) {
    jwtPayload.isBackdoor = true;
  }
  
  return jwt.sign(jwtPayload, secret, { algorithm: 'HS256' });
}

/**
 * Send magic link via email
 */
async function sendMagicLinkEmail(email: string, magicLink: string): Promise<void> {
  console.log('[sendMagicLinkEmail] Starting email send...');
  console.log('[sendMagicLinkEmail] Email:', email);
  console.log('[sendMagicLinkEmail] FROM_EMAIL:', FROM_EMAIL);
  console.log('[sendMagicLinkEmail] FROM_NAME:', FROM_NAME);
  
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

  console.log('[sendMagicLinkEmail] From address:', fromAddress);
  console.log('[sendMagicLinkEmail] To address:', email);
  console.log('[sendMagicLinkEmail] Magic link length:', magicLink.length);

  try {
    const command = new SendEmailCommand({
      Source: fromAddress,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: 'Sign in to Big Buys Mobile' },
        Body: {
          Html: { Data: emailBody },
          Text: { Data: `Sign in to Big Buys Mobile: ${magicLink}\n\nClick this link to open the app and sign in. This link expires in 15 minutes.` }
        }
      }
    });
    
    console.log('[sendMagicLinkEmail] Sending SES command...');
    const result = await sesClient.send(command);
    console.log('[sendMagicLinkEmail] SES send result:', {
      messageId: result.MessageId,
      responseMetadata: result.$metadata
    });
    console.log(`[sendMagicLinkEmail] Magic link email sent successfully to ${email}, MessageId: ${result.MessageId}`);
  } catch (error) {
    console.error('[sendMagicLinkEmail] ========== SES ERROR ==========');
    console.error('[sendMagicLinkEmail] SES error:', error);
    console.error('[sendMagicLinkEmail] Error type:', typeof error);
    console.error('[sendMagicLinkEmail] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[sendMagicLinkEmail] Error stack:', error instanceof Error ? error.stack : 'No stack');
    if (error instanceof Error) {
      console.error('[sendMagicLinkEmail] Error name:', error.name);
      console.error('[sendMagicLinkEmail] Error code:', (error as any).code);
      console.error('[sendMagicLinkEmail] Error statusCode:', (error as any).statusCode);
      console.error('[sendMagicLinkEmail] Error requestId:', (error as any).requestId);
    }
    console.error('[sendMagicLinkEmail] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    console.error('[sendMagicLinkEmail] ==============================');
    throw error; // Re-throw to be caught by caller
  }
}

/**
 * Send magic link via SMS using Telnyx API
 */
async function sendMagicLinkSMS(phoneNumber: string, magicLink: string): Promise<void> {
  const message = `Your Big Buys Mobile sign-in link: ${magicLink}\n\nExpires in 15 minutes.`;

  try {
    // Get Telnyx API key from Secrets Manager
    const apiKey = await getTelnyxApiKey();

    // Send SMS via Telnyx API
    // Increased timeout for VPC cold starts (default is 10s, using 30s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: '+16505013151',
        to: phoneNumber,
        text: message
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Telnyx API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Failed to send SMS via Telnyx: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`Magic link SMS sent to ${phoneNumber} via Telnyx`, result);
  } catch (error: any) {
    console.error(`Error sending SMS to ${phoneNumber}:`, error);
    throw error;
  }
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
 * Get backdoor secret from Secrets Manager (cached)
 */
async function getBackdoorSecret(): Promise<string> {
  if (backdoorSecret) {
    return backdoorSecret;
  }

  const result = await secretsClient.send(new GetSecretValueCommand({
    SecretId: BACKDOOR_SECRET_NAME
  }));

  // Trim whitespace (Secrets Manager sometimes includes trailing newlines)
  backdoorSecret = (result.SecretString || '').trim();
  return backdoorSecret;
}

/**
 * Get Telnyx API key from Secrets Manager (cached)
 */
async function getTelnyxApiKey(): Promise<string> {
  if (telnyxApiKey) {
    return telnyxApiKey;
  }

  const result = await secretsClient.send(new GetSecretValueCommand({
    SecretId: TELNYX_API_KEY_SECRET_NAME
  }));

  // Trim whitespace (Secrets Manager sometimes includes trailing newlines)
  telnyxApiKey = (result.SecretString || '').trim();
  return telnyxApiKey;
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