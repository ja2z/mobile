/**
 * Phone Number Validation Lambda Handler
 * Handles phone number validation via SMS verification codes.
 * Requires Bearer session JWT (from magic link auth) — does NOT accept API key / emailhash.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { randomBytes } from 'crypto';
import { verifySessionJWT, extractBearerToken, SessionPayload } from '../shared/session-jwt';
import { getUserProfile, updateUser } from '../shared/user-service';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const secretsClient = new SecretsManagerClient({});

const VERIFICATIONS_TABLE = process.env.VERIFICATIONS_TABLE || 'mobile-phone-verifications';
const TELNYX_API_KEY_SECRET_NAME = process.env.TELNYX_API_KEY_SECRET_NAME || 'mobile-app/telnyx-api-key';

/** Cooldown only when replacing an existing verified number (14 days). */
const PHONE_CHANGE_COOLDOWN_SECONDS =
  parseInt(process.env.PHONE_CHANGE_COOLDOWN_SECONDS || '', 10) || 14 * 24 * 60 * 60;

let telnyxApiKey: string | null = null;

/**
 * Main Lambda handler
 */
export const handler = async (event: any) => {
  console.log('[handler] ========== PHONE VALIDATION LAMBDA INVOCATION START ==========');
  console.log('[handler] Received event:', JSON.stringify(event, null, 2));

  try {
    let path = event.path || event.rawPath;
    const method = event.httpMethod || event.requestContext?.http?.method;

    if (path.startsWith('/v1/v1/')) {
      path = path.replace('/v1/v1/', '/v1/');
    } else if (path.startsWith('/phone/')) {
      path = '/v1' + path;
    }

    console.log(`[handler] Final path for routing: ${path}, method: ${method}`);

    let body: any = {};
    if (method === 'POST' && event.body) {
      try {
        body = JSON.parse(event.body);
      } catch {
        return createResponse(400, { error: 'Invalid JSON in request body' });
      }
    }

    if (path === '/v1/phone/validate' && method === 'POST') {
      return await handleValidatePhone(body, event);
    } else if (path === '/v1/phone/verify' && method === 'POST') {
      return await handleVerifyPhoneCode(body, event);
    } else {
      return createResponse(404, { error: 'Not found' });
    }
  } catch (error: any) {
    console.error('[handler] Unexpected error:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'An unexpected error occurred'
    });
  }
};

// ─── Auth helper ───────────────────────────────────────────────────────────────

async function authenticateRequest(event: any): Promise<SessionPayload | { error: ReturnType<typeof createResponse> }> {
  const headers = event.headers || {};
  const authHeader = headers['Authorization'] || headers['authorization'];
  const token = extractBearerToken(authHeader);

  if (!token) {
    return { error: createResponse(401, { error: 'Authorization header with Bearer token is required' }) };
  }

  try {
    return await verifySessionJWT(token);
  } catch (err: any) {
    console.warn('[authenticateRequest] JWT verification failed:', err.message);
    if (err.name === 'TokenExpiredError') {
      return { error: createResponse(401, { error: 'Session expired. Please sign in again.' }) };
    }
    return { error: createResponse(401, { error: 'Invalid session token' }) };
  }
}

function isAuthError(result: any): result is { error: ReturnType<typeof createResponse> } {
  return result && 'error' in result && result.error?.statusCode !== undefined;
}

function normalizeE164Phone(p: string): string {
  return p.trim();
}

/** True when user already has a verified phone and the new value is different. */
function isChangingPhoneNumber(
  existing: string | undefined | null,
  requested: string
): boolean {
  const e = existing?.trim();
  if (!e) return false;
  return normalizeE164Phone(e) !== normalizeE164Phone(requested);
}

/**
 * If changing numbers too soon after last verification, return 403 JSON; otherwise null.
 */
function phoneChangeCooldownResponse(
  verifiedAt: number | string | undefined | null
): ReturnType<typeof createResponse> | null {
  // Postgres BIGINT often arrives as a string; + must be numeric or JS string-concats (wrong).
  const v =
    verifiedAt == null || verifiedAt === ''
      ? NaN
      : typeof verifiedAt === 'string'
        ? Number(verifiedAt)
        : Number(verifiedAt);
  if (!Number.isFinite(v) || v <= 0) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  const nextAllowedAt = v + PHONE_CHANGE_COOLDOWN_SECONDS;
  if (now >= nextAllowedAt) {
    return null;
  }
  return createResponse(403, {
    error: 'phone_change_cooldown',
    message: `You can change your phone number again after ${PHONE_CHANGE_COOLDOWN_SECONDS / 86400} days from the last verification.`,
    nextAllowedAt,
    cooldownSecondsRemaining: nextAllowedAt - now,
  });
}

// ─── Validate ──────────────────────────────────────────────────────────────────

async function handleValidatePhone(body: any, event: any) {
  console.log('[handleValidatePhone] Starting phone validation');

  const authResult = await authenticateRequest(event);
  if (isAuthError(authResult)) return authResult.error;
  const session: SessionPayload = authResult;

  const { phoneNumber } = body;
  if (!phoneNumber) {
    return createResponse(400, { error: 'Phone number is required' });
  }

  if (!isValidPhoneNumber(phoneNumber)) {
    return createResponse(400, { error: 'Invalid phone number format. Use E.164 format (e.g., +14155551234)' });
  }

  const user = await getUserProfile(session.userId);
  if (!user) {
    return createResponse(403, { error: 'User account not found. Please sign in with your email first.' });
  }

  if (isChangingPhoneNumber(user.phoneNumber, phoneNumber)) {
    const blocked = phoneChangeCooldownResponse(user.phoneNumberVerifiedAt ?? null);
    if (blocked) {
      return blocked;
    }
  }

  const emailLower = session.email.toLowerCase();

  // Invalidate any existing verification codes for this phone/email
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

    if (existingCodes.Items && existingCodes.Items.length > 0) {
      console.log(`[handleValidatePhone] Invalidating ${existingCodes.Items.length} previous code(s)`);
      const now = Math.floor(Date.now() / 1000);

      await Promise.all(existingCodes.Items.map(item =>
        docClient.send(new UpdateCommand({
          TableName: VERIFICATIONS_TABLE,
          Key: { verificationId: item.verificationId },
          UpdateExpression: 'SET used = :used, invalidatedAt = :now',
          ExpressionAttributeValues: { ':used': true, ':now': now }
        }))
      ));
    }
  } catch (error) {
    console.error('[handleValidatePhone] Error invalidating previous codes:', error);
  }

  const verificationCode = generateVerificationCode();
  const verificationId = `ver_${randomBytes(16).toString('hex')}`;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 300; // 5 minutes

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

  try {
    await sendVerificationCodeSMS(phoneNumber, verificationCode);
    console.log(`[handleValidatePhone] SMS sent successfully to ${phoneNumber}`);
  } catch (error: any) {
    console.error('[handleValidatePhone] Error sending SMS:', error);

    if (error.message && (
      error.message.includes('Invalid phone number') ||
      error.message.includes('422') ||
      error.message.includes('invalid_phone_number')
    )) {
      return createResponse(400, { error: 'Invalid phone number format' });
    }

    return createResponse(500, { error: 'Failed to send verification code' });
  }

  return createResponse(200, { success: true, message: 'Verification code sent' });
}

// ─── Verify ────────────────────────────────────────────────────────────────────

async function handleVerifyPhoneCode(body: any, event: any) {
  console.log('[handleVerifyPhoneCode] Starting code verification');

  const authResult = await authenticateRequest(event);
  if (isAuthError(authResult)) return authResult.error;
  const session: SessionPayload = authResult;

  const { phoneNumber, verificationCode } = body;
  if (!phoneNumber || !verificationCode) {
    return createResponse(400, { error: 'Phone number and verification code are required' });
  }

  if (!isValidPhoneNumber(phoneNumber)) {
    return createResponse(400, { error: 'Invalid phone number format. Use E.164 format (e.g., +14155551234)' });
  }

  const emailLower = session.email.toLowerCase();

  try {
    const result = await docClient.send(new QueryCommand({
      TableName: VERIFICATIONS_TABLE,
      IndexName: 'phone-email-index',
      KeyConditionExpression: 'phoneNumber = :phone AND email = :email',
      ExpressionAttributeValues: {
        ':phone': phoneNumber,
        ':email': emailLower
      },
      ScanIndexForward: false
    }));

    if (!result.Items || result.Items.length === 0) {
      return createResponse(404, { error: 'Verification code not found or expired' });
    }

    let verification = null;
    const now = Math.floor(Date.now() / 1000);

    for (const item of result.Items) {
      if (now >= item.expiresAt) continue;
      if (item.used) continue;
      if (item.verificationCode === verificationCode) {
        verification = item;
        break;
      }
    }

    if (!verification) {
      return createResponse(404, { error: 'Verification code not found or expired' });
    }

    // User must already exist (created at magic link time)
    const user = await getUserProfile(session.userId);
    if (!user) {
      console.error(`[handleVerifyPhoneCode] No user found for userId ${session.userId}`);
      return createResponse(403, { error: 'User account not found. Please sign in with your email first.' });
    }

    if (isChangingPhoneNumber(user.phoneNumber, phoneNumber)) {
      const blocked = phoneChangeCooldownResponse(user.phoneNumberVerifiedAt ?? null);
      if (blocked) {
        return blocked;
      }
    }

    const sameNumberReverify =
      !!user.phoneNumber?.trim() &&
      normalizeE164Phone(user.phoneNumber) === normalizeE164Phone(phoneNumber);

    if (!sameNumberReverify) {
      await updateUser(session.userId, {
        phoneNumber,
        phoneNumberVerifiedAt: now,
      });
      console.log(`[handleVerifyPhoneCode] Updated user ${session.userId} with phone number ${phoneNumber}`);
    } else {
      console.log(`[handleVerifyPhoneCode] Same number re-verified for ${session.userId}; skipping profile update`);
    }

    await docClient.send(new UpdateCommand({
      TableName: VERIFICATIONS_TABLE,
      Key: { verificationId: verification.verificationId },
      UpdateExpression: 'SET used = :used, usedAt = :now',
      ExpressionAttributeValues: { ':used': true, ':now': now }
    }));

    return createResponse(200, { success: true, message: 'Phone number verified' });
  } catch (error: any) {
    console.error('[handleVerifyPhoneCode] Error verifying code:', error);
    return createResponse(500, { error: 'Failed to verify code' });
  }
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

async function sendVerificationCodeSMS(phoneNumber: string, verificationCode: string): Promise<void> {
  const message = `Your Zeta verification code is: ${verificationCode}\n\nExpires in 5 minutes.`;
  const apiKey = await getTelnyxApiKey();

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
    try { errorData = JSON.parse(errorText); } catch { /* ignore */ }

    console.error(`[sendVerificationCodeSMS] Telnyx API error: ${response.status} ${response.statusText}`, errorText);

    if (response.status === 422 || (response.status === 400 && errorData?.errors?.[0]?.code === 'invalid_phone_number')) {
      throw new Error('Invalid phone number format');
    }
    throw new Error(`Failed to send SMS via Telnyx: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  console.log(`[sendVerificationCodeSMS] Verification code SMS sent to ${phoneNumber} via Telnyx`, result);
}

function generateVerificationCode(): string {
  const min = 10000;
  const max = 99999;
  return (Math.floor(Math.random() * (max - min + 1)) + min).toString();
}

function isValidPhoneNumber(phoneNumber: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phoneNumber);
}

function createResponse(statusCode: number, body: any) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

async function getTelnyxApiKey(): Promise<string> {
  if (telnyxApiKey) return telnyxApiKey;
  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: TELNYX_API_KEY_SECRET_NAME }));
  telnyxApiKey = (result.SecretString || '').trim();
  return telnyxApiKey;
}
