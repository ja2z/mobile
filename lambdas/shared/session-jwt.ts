/**
 * Shared Session JWT Verification
 * Uses Node native crypto for HS256 verification — no external jsonwebtoken dependency.
 * Aligned with auth-handler's generateSessionJWT payload shape.
 */

import { createHmac } from 'crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});
const JWT_SECRET_NAME = process.env.JWT_SECRET_NAME || 'mobile-app/jwt-secret';

let cachedSecret: string | null = null;

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  deviceId: string;
  exp: number;
  iat: number;
  isBackdoor?: boolean;
}

async function getJWTSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: JWT_SECRET_NAME })
  );
  cachedSecret = result.SecretString || '';
  return cachedSecret;
}

function base64UrlDecode(str: string): Buffer {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad === 2) s += '==';
  else if (pad === 3) s += '=';
  return Buffer.from(s, 'base64');
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Verify a session JWT (HS256) and return the decoded payload.
 * Throws on invalid / expired / missing token.
 */
export async function verifySessionJWT(token: string): Promise<SessionPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw Object.assign(new Error('Malformed JWT'), { name: 'JsonWebTokenError' });
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Verify header specifies HS256
  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
  if (header.alg !== 'HS256') {
    throw Object.assign(new Error(`Unsupported algorithm: ${header.alg}`), { name: 'JsonWebTokenError' });
  }

  // Verify signature
  const secret = await getJWTSecret();
  const expectedSig = base64UrlEncode(
    createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest()
  );

  if (expectedSig !== signatureB64) {
    throw Object.assign(new Error('Invalid signature'), { name: 'JsonWebTokenError' });
  }

  const payload: SessionPayload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= payload.exp) {
    throw Object.assign(new Error('Token has expired'), { name: 'TokenExpiredError' });
  }

  return payload;
}

/**
 * Extract Bearer token from an Authorization header value.
 */
export function extractBearerToken(authHeader: string | undefined | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}
