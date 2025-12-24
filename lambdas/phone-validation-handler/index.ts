/**
 * Phone Number Validation Lambda Handler
 * Handles phone number validation via SMS verification codes
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { randomBytes, createHash } from 'crypto';
import { validateRole, getUserProfileByEmail } from '../shared/user-validation';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const secretsClient = new SecretsManagerClient({});

// Environment variables
const VERIFICATIONS_TABLE = process.env.VERIFICATIONS_TABLE || 'mobile-phone-verifications';
const APPROVED_EMAILS_TABLE = process.env.APPROVED_EMAILS_TABLE || 'mobile-approved-emails';
const USERS_TABLE = process.env.USERS_TABLE || 'mobile-users';
const API_KEY_SECRET_NAME = process.env.API_KEY_SECRET_NAME || 'mobile-app/api-key';
const TELNYX_API_KEY_SECRET_NAME = process.env.TELNYX_API_KEY_SECRET_NAME || 'mobile-app/telnyx-api-key';

// Cache for secrets (reduces Secrets Manager calls)
let apiKey: string | null = null;
let telnyxApiKey: string | null = null;

/**
 * Main Lambda handler - routes to appropriate function based on path
 */
export const handler = async (event: any) => {
  console.log('[handler] ========== PHONE VALIDATION LAMBDA INVOCATION START ==========');
  console.log('[handler] Received event:', JSON.stringify(event, null, 2));

  try {
    let path = event.path || event.rawPath;
    const method = event.httpMethod || event.requestContext?.http?.method;

    console.log('[handler] Path:', path, 'Method:', method);

    // Normalize path
    if (path.startsWith('/v1/v1/')) {
      path = path.replace('/v1/v1/', '/v1/');
    } else if (path.startsWith('/phone/')) {
      path = '/v1' + path;
    }

    console.log(`[handler] Final path for routing: ${path}, method: ${method}`);

    // Parse body for POST requests
    let body = {};
    if (method === 'POST' && event.body) {
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
    if (path === '/v1/phone/validate' && method === 'POST') {
      return await handleValidatePhone(body, event);
    } else if (path === '/v1/phone/verify' && method === 'POST') {
      return await handleVerifyPhoneCode(body, event);
    } else {
      console.log('[handler] No matching route found');
      return createResponse(404, { error: 'Not found' });
    }
  } catch (error: any) {
    console.error('[handler] Unexpected error:', error);
    console.error('[handler] Error stack:', error instanceof Error ? error.stack : 'No stack');
    return createResponse(500, { 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'An unexpected error occurred'
    });
  }
};

/**
 * Handle phone number validation and send verification code
 */
async function handleValidatePhone(body: any, event: any) {
  console.log('[handleValidatePhone] Starting phone validation');
  const { phoneNumber, email, emailhash } = body;

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
  console.log(`[handleValidatePhone] API key validation: provided length=${trimmedProvided.length}, valid length=${trimmedValid.length}, match=${trimmedProvided === trimmedValid}`);
  
  if (trimmedProvided !== trimmedValid) {
    return createResponse(401, { error: 'Invalid API key' });
  }

  // Validate input
  if (!phoneNumber || !email) {
    return createResponse(400, { error: 'Phone number and email are required' });
  }

  if (!emailhash) {
    return createResponse(400, { error: 'Email hash is required' });
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return createResponse(400, { error: 'Invalid email format' });
  }

  // Validate email hash
  const secretKey = await getApiKey();
  const hashInput = secretKey + email;
  const expectedHash = createHash('sha256').update(hashInput).digest('hex');

  if (emailhash.toLowerCase() !== expectedHash.toLowerCase()) {
    console.warn(`[handleValidatePhone] Email hash verification failed for email: ${email}`);
    return createResponse(401, { 
      error: 'Invalid email signature',
      message: 'The email signature is invalid. This request may have been tampered with.'
    });
  }

  console.log(`[handleValidatePhone] Email hash verified successfully for email: ${email}`);

  // Validate phone number format (E.164)
  if (!isValidPhoneNumber(phoneNumber)) {
    return createResponse(400, { error: 'Invalid phone number format. Use E.164 format (e.g., +14155551234)' });
  }

  const emailLower = email.toLowerCase();

  // Invalidate any existing verification codes for this phone/email combination
  // This ensures only the latest code is valid
  try {
    const existingCodes = await docClient.send(new QueryCommand({
      TableName: VERIFICATIONS_TABLE,
      IndexName: 'phone-email-index',
      KeyConditionExpression: 'phoneNumber = :phone AND email = :email',
      ExpressionAttributeValues: {
        ':phone': phoneNumber,
        ':email': emailLower
      }
    }));

    // Mark all existing codes as used (invalidated)
    if (existingCodes.Items && existingCodes.Items.length > 0) {
      console.log(`[handleValidatePhone] Found ${existingCodes.Items.length} existing verification code(s), invalidating...`);
      const now = Math.floor(Date.now() / 1000);
      
      // Update all existing codes to mark as used
      const updatePromises = existingCodes.Items.map(item => 
        docClient.send(new UpdateCommand({
          TableName: VERIFICATIONS_TABLE,
          Key: { verificationId: item.verificationId },
          UpdateExpression: 'SET used = :used, invalidatedAt = :now',
          ExpressionAttributeValues: {
            ':used': true,
            ':now': now
          }
        }))
      );
      
      await Promise.all(updatePromises);
      console.log(`[handleValidatePhone] Invalidated ${existingCodes.Items.length} previous verification code(s)`);
    }
  } catch (error) {
    console.error('[handleValidatePhone] Error invalidating previous codes:', error);
    // Continue anyway - don't fail the request if we can't invalidate old codes
  }

  // Generate 5-digit verification code
  const verificationCode = generateVerificationCode();
  const verificationId = `ver_${randomBytes(16).toString('hex')}`;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 300; // 5 minutes

  // Store verification code in DynamoDB
  try {
    await docClient.send(new PutCommand({
      TableName: VERIFICATIONS_TABLE,
      Item: {
        verificationId,
        phoneNumber,
        email: emailLower,
        verificationCode,
        createdAt: now,
        expiresAt,
        used: false
      }
    }));
    console.log(`[handleValidatePhone] Stored verification code for ${phoneNumber} (expires at ${expiresAt})`);
  } catch (error) {
    console.error('[handleValidatePhone] Error storing verification code:', error);
    return createResponse(500, { error: 'Failed to store verification code' });
  }

  // Send SMS via Telnyx (this also validates the phone number)
  try {
    await sendVerificationCodeSMS(phoneNumber, verificationCode);
    console.log(`[handleValidatePhone] SMS sent successfully to ${phoneNumber}`);
  } catch (error: any) {
    console.error('[handleValidatePhone] Error sending SMS:', error);
    
    // Check if it's an invalid phone number error from Telnyx
    if (error.message && (
      error.message.includes('Invalid phone number') ||
      error.message.includes('422') ||
      error.message.includes('invalid_phone_number')
    )) {
      return createResponse(400, { error: 'Invalid phone number format' });
    }
    
    return createResponse(500, { error: 'Failed to send verification code' });
  }

  return createResponse(200, {
    success: true,
    message: 'Verification code sent'
  });
}

/**
 * Handle verification code verification and user creation/update
 */
async function handleVerifyPhoneCode(body: any, event: any) {
  console.log('[handleVerifyPhoneCode] Starting code verification');
  const { phoneNumber, email, emailhash, verificationCode } = body;

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
  console.log(`[handleVerifyPhoneCode] API key validation: provided length=${trimmedProvided.length}, valid length=${trimmedValid.length}, match=${trimmedProvided === trimmedValid}`);
  
  if (trimmedProvided !== trimmedValid) {
    return createResponse(401, { error: 'Invalid API key' });
  }

  // Validate input
  if (!phoneNumber || !email || !verificationCode) {
    return createResponse(400, { error: 'Phone number, email, and verification code are required' });
  }

  if (!emailhash) {
    return createResponse(400, { error: 'Email hash is required' });
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return createResponse(400, { error: 'Invalid email format' });
  }

  // Validate email hash
  const secretKey = await getApiKey();
  const hashInput = secretKey + email;
  const expectedHash = createHash('sha256').update(hashInput).digest('hex');

  if (emailhash.toLowerCase() !== expectedHash.toLowerCase()) {
    console.warn(`[handleVerifyPhoneCode] Email hash verification failed for email: ${email}`);
    return createResponse(401, { 
      error: 'Invalid email signature',
      message: 'The email signature is invalid. This request may have been tampered with.'
    });
  }

  console.log(`[handleVerifyPhoneCode] Email hash verified successfully for email: ${email}`);

  // Validate phone number format
  if (!isValidPhoneNumber(phoneNumber)) {
    return createResponse(400, { error: 'Invalid phone number format. Use E.164 format (e.g., +14155551234)' });
  }

  const emailLower = email.toLowerCase();

  // Look up verification code
  try {
    // Query without FilterExpression first to get all codes, then filter in code
    // This avoids FilterExpression issues with boolean values
    // No limit - query all codes for this phone/email combo to ensure we don't miss the correct code
    const result = await docClient.send(new QueryCommand({
      TableName: VERIFICATIONS_TABLE,
      IndexName: 'phone-email-index',
      KeyConditionExpression: 'phoneNumber = :phone AND email = :email',
      ExpressionAttributeValues: {
        ':phone': phoneNumber,
        ':email': emailLower
      },
      ScanIndexForward: false // Most recent first
    }));

    console.log(`[handleVerifyPhoneCode] Query returned ${result.Items?.length || 0} item(s) for ${phoneNumber} / ${emailLower}`);

    if (!result.Items || result.Items.length === 0) {
      console.log(`[handleVerifyPhoneCode] No verification code found for ${phoneNumber} / ${emailLower}`);
      return createResponse(404, { error: 'Verification code not found or expired' });
    }

    // Find the matching verification code (check most recent first)
    let verification = null;
    const now = Math.floor(Date.now() / 1000);
    
    for (const item of result.Items) {
      // Skip expired codes
      if (now >= item.expiresAt) {
        console.log(`[handleVerifyPhoneCode] Skipping expired code (expiresAt: ${item.expiresAt}, now: ${now})`);
        continue;
      }
      
      // Skip used codes
      if (item.used) {
        console.log(`[handleVerifyPhoneCode] Skipping used code`);
        continue;
      }
      
      // Check if code matches
      if (item.verificationCode === verificationCode) {
        verification = item;
        console.log(`[handleVerifyPhoneCode] Found matching verification code: ${verificationCode}`);
        break;
      }
    }

    if (!verification) {
      console.log(`[handleVerifyPhoneCode] No valid verification code found matching ${verificationCode}`);
      return createResponse(404, { error: 'Verification code not found or expired' });
    }

    // Check if code is expired (double-check)
    if (now >= verification.expiresAt) {
      console.log(`[handleVerifyPhoneCode] Verification code expired (expiresAt: ${verification.expiresAt}, now: ${now})`);
      return createResponse(404, { error: 'Verification code expired' });
    }

    // Check if code already used (double-check)
    if (verification.used) {
      console.log(`[handleVerifyPhoneCode] Verification code already used`);
      return createResponse(400, { error: 'Verification code already used' });
    }

    console.log(`[handleVerifyPhoneCode] Verification code validated successfully`);

    // Check whitelist before creating/updating user
    const isApproved = await isEmailApproved(emailLower);
    if (!isApproved) {
      console.log(`[handleVerifyPhoneCode] Email not approved: ${emailLower}`);
      return createResponse(403, { 
        error: 'Not whitelisted',
        message: 'User is not whitelisted for Big Buys Mobile'
      });
    }

    // Create or update user profile with phone number
    const user = await getOrCreateUserProfile(emailLower, 'phone');
    
    // Update user record to add phoneNumber
    await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId: user.userId },
      UpdateExpression: 'SET phoneNumber = :phone, updatedAt = :now',
      ExpressionAttributeValues: {
        ':phone': phoneNumber,
        ':now': now
      }
    }));

    console.log(`[handleVerifyPhoneCode] Updated user ${user.userId} with phone number ${phoneNumber}`);

    // Mark verification code as used
    await docClient.send(new UpdateCommand({
      TableName: VERIFICATIONS_TABLE,
      Key: { verificationId: verification.verificationId },
      UpdateExpression: 'SET used = :used, usedAt = :now',
      ExpressionAttributeValues: {
        ':used': true,
        ':now': now
      }
    }));

    console.log(`[handleVerifyPhoneCode] Marked verification code as used`);

    return createResponse(200, {
      success: true,
      message: 'Phone number verified'
    });
  } catch (error: any) {
    console.error('[handleVerifyPhoneCode] Error verifying code:', error);
    
    // Handle whitelist validation errors
    if (error instanceof Error && (
      error.message.includes('not approved') || 
      error.message.includes('not on the whitelist') ||
      error.message.includes('expired')
    )) {
      return createResponse(403, { 
        error: 'Not whitelisted',
        message: 'User is not whitelisted for Big Buys Mobile'
      });
    }
    
    return createResponse(500, { error: 'Failed to verify code' });
  }
}

/**
 * Get or create user profile with lazy provisioning
 * Similar to auth-handler's getOrCreateUserProfile but adapted for phone validation
 */
async function getOrCreateUserProfile(email: string, registrationMethod: string = 'phone'): Promise<{ userId: string; email: string; role: string }> {
  const emailLower = email.toLowerCase();
  
  // First, try to find existing user by email
  const existingUser = await getUserProfileByEmail(emailLower);
  
  if (existingUser) {
    // User exists, return their profile
    const role = validateRole(existingUser.role) || 'basic';
    
    // Update registration method if not set
    // Note: registrationMethod is not in UserProfile interface but exists in DynamoDB
    const userAny = existingUser as any;
    if (!userAny.registrationMethod) {
      const now = Math.floor(Date.now() / 1000);
      await docClient.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { userId: existingUser.userId },
        UpdateExpression: 'SET registrationMethod = :method, updatedAt = :now',
        ExpressionAttributeValues: {
          ':method': registrationMethod,
          ':now': now
        }
      }));
    }
    
    return {
      userId: existingUser.userId,
      email: existingUser.email,
      role: role
    };
  }

  // User doesn't exist - create new user profile
  // Check whitelist for role and expiration
  let userRole = 'basic';
  let expirationDate: number | undefined = undefined;
  
  // Check whitelist if not a Sigma email (Sigma emails bypass whitelist)
  if (!emailLower.endsWith('@sigmacomputing.com')) {
    try {
      const whitelistResult = await docClient.send(new GetCommand({
        TableName: APPROVED_EMAILS_TABLE,
        Key: { email: emailLower }
      }));

      // Block registration if not actively whitelisted
      if (!whitelistResult.Item) {
        console.log(`[getOrCreateUserProfile] Registration blocked: ${emailLower} is not whitelisted`);
        throw new Error('Email not approved for registration. This email is not on the whitelist.');
      }

      // Check if whitelist entry has expired
      if (whitelistResult.Item.expirationDate) {
        const now = Math.floor(Date.now() / 1000);
        if (now >= whitelistResult.Item.expirationDate) {
          console.log(`[getOrCreateUserProfile] Registration blocked: ${emailLower} whitelist entry has expired`);
          throw new Error('Whitelist entry has expired. This email is no longer approved for access.');
        }
        expirationDate = whitelistResult.Item.expirationDate;
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
        UpdateExpression: 'SET registeredAt = if_not_exists(registeredAt, :now)',
        ExpressionAttributeValues: { ':now': now }
      }));
    } catch (error) {
      // Re-throw whitelist validation errors
      if (error instanceof Error && (
        error.message.includes('not approved') || 
        error.message.includes('expired')
      )) {
        throw error;
      }
      // For other errors, log and re-throw
      console.error('[getOrCreateUserProfile] Error checking whitelist:', error);
      throw new Error('Unable to verify email approval. Registration blocked for security.');
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

/**
 * Check if email is approved (whitelisted or Sigma email)
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
    if (result.Item.expirationDate) {
      const now = Math.floor(Date.now() / 1000);
      return now < result.Item.expirationDate;
    }

    return true;
  } catch (error) {
    console.error('[isEmailApproved] Error checking email approval:', error);
    throw error;
  }
}

/**
 * Send verification code via SMS using Telnyx API
 */
async function sendVerificationCodeSMS(phoneNumber: string, verificationCode: string): Promise<void> {
  const message = `Your Big Buys Mobile verification code is: ${verificationCode}\n\nExpires in 5 minutes.`;

  try {
    // Get Telnyx API key from Secrets Manager
    const apiKey = await getTelnyxApiKey();

    // Send SMS via Telnyx API
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
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        // If not JSON, use text as error message
      }
      
      console.error(`[sendVerificationCodeSMS] Telnyx API error: ${response.status} ${response.statusText}`, errorText);
      
      // Check for invalid phone number errors
      if (response.status === 422 || (response.status === 400 && errorData?.errors?.[0]?.code === 'invalid_phone_number')) {
        throw new Error('Invalid phone number format');
      }
      
      throw new Error(`Failed to send SMS via Telnyx: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`[sendVerificationCodeSMS] Verification code SMS sent to ${phoneNumber} via Telnyx`, result);
  } catch (error: any) {
    console.error(`[sendVerificationCodeSMS] Error sending SMS to ${phoneNumber}:`, error);
    throw error;
  }
}

/**
 * Generate random 5-digit verification code (10000-99999)
 */
function generateVerificationCode(): string {
  const min = 10000;
  const max = 99999;
  const code = Math.floor(Math.random() * (max - min + 1)) + min;
  return code.toString();
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number format (E.164)
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
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(body)
  };
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

  apiKey = (result.SecretString || '').trim();
  return apiKey;
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

  telnyxApiKey = (result.SecretString || '').trim();
  return telnyxApiKey;
}

