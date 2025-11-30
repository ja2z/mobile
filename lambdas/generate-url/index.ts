import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import crypto from 'crypto';
import { validateUserExpiration, checkUserDeactivated } from '../shared/user-validation';
import { logActivityAndUpdateLastActive, getActivityLogEmail } from '../shared/activity-logger';
import * as jwt from 'jsonwebtoken';

// Get AWS region from environment or default to us-west-2
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';

// Initialize Secrets Manager client
const secretsManager = new SecretsManagerClient({ region: AWS_REGION });

// Cache the secrets to avoid repeated calls
let cachedSessionSecret: string | null = null;
let cachedEmbedSecret: string | null = null;

/**
 * Get IP address from event
 */
function getIpAddress(event: any): string | undefined {
  return event.requestContext?.identity?.sourceIp || 
         event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
         event.headers?.['X-Forwarded-For']?.split(',')[0]?.trim();
}

/**
 * Get session JWT secret (for verifying user session JWTs)
 * Uses mobile-app/jwt-secret, stored as plain string
 */
async function getSessionSecret(): Promise<string> {
    if (cachedSessionSecret) {
        console.log('Using cached session secret');
        return cachedSessionSecret;
    }
    
    try {
        console.log(`Fetching session secret from Secrets Manager in region: ${AWS_REGION}`);
        const command = new GetSecretValueCommand({
            SecretId: "mobile-app/jwt-secret"
        });
        
        const response = await secretsManager.send(command);
        console.log('Session secret retrieved successfully');
        
        // Read SecretString directly as plain string (matching auth-handler format)
        const jwtSecret = response.SecretString || '';
        
        if (!jwtSecret) {
            throw new Error('Session JWT secret not found in secrets manager response');
        }
        
        cachedSessionSecret = jwtSecret;
        return jwtSecret;
    } catch (error: any) {
        console.error('Error fetching session secret from Secrets Manager:', error);
        throw new Error(`Failed to fetch session JWT secret: ${error.message}`);
    }
}

/**
 * Get embed JWT secret (for signing Sigma embed JWTs)
 * Uses sigma/jwt-secret, stored as JSON with JWT_SECRET field
 */
async function getEmbedSecret(): Promise<string> {
    if (cachedEmbedSecret) {
        console.log('Using cached embed secret');
        return cachedEmbedSecret;
    }
    
    try {
        console.log(`Fetching embed secret from Secrets Manager in region: ${AWS_REGION}`);
        const command = new GetSecretValueCommand({
            SecretId: "sigma/jwt-secret"
        });
        
        const response = await secretsManager.send(command);
        console.log('Embed secret retrieved successfully');
        
        // Parse JSON and extract JWT_SECRET field (original format)
        const secret = JSON.parse(response.SecretString || '{}');
        const jwtSecret = secret.JWT_SECRET;
        
        if (!jwtSecret) {
            throw new Error('JWT_SECRET not found in secrets manager response');
        }
        
        cachedEmbedSecret = jwtSecret;
        return jwtSecret;
    } catch (error: any) {
        console.error('Error fetching embed secret from Secrets Manager:', error);
        throw new Error(`Failed to fetch embed JWT secret: ${error.message}`);
    }
}

function base64UrlEncode(str: string): string {
    return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function generateUUID(): string {
    return crypto.randomUUID();
}

function addEmbedToEmail(email: string): string {
    // Split email at @ symbol
    const [username, domain] = email.split('@');
    // Add +embed to username if it doesn't already contain +embed
    if (!username.includes('+embed')) {
        return `${username}+embed@${domain}`;
    }
    // Return as-is if +embed is already present
    return email;
}

/**
 * Verify JWT signature and expiration
 * Returns decoded payload if valid, throws error if invalid
 */
function verifyJWT(token: string, secret: string): any {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
    }
    
    const [encodedHeader, encodedPayload, signature] = parts;
    
    // Verify signature
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signatureInput)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    
    if (signature !== expectedSignature) {
        throw new Error('Invalid JWT signature');
    }
    
    // Decode payload
    const payload = JSON.parse(
        Buffer.from(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    );
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
        throw new Error('JWT has expired');
    }
    
    return payload;
}

function createJWT(payload: any, secret: string): string {
    // Header
    const header = {
        alg: "HS256",
        typ: "JWT",
        kid: "ff917c5524fa296ed349ea375657ccc721765ff12b0e276cc3cd5873812c4355"
    };
    
    // Encode header and payload
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    
    // Create signature
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
        .createHmac('sha256', secret)
        .update(signatureInput)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    
    // Return complete JWT
    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export const handler = async (event: any) => {
    console.log('Lambda handler invoked');
    console.log('Event:', JSON.stringify(event, null, 2));
    
    try {
        // Extract JWT from Authorization header
        const authHeader = event.headers?.Authorization || event.headers?.authorization;
        if (!authHeader) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Missing Authorization header'
                })
            };
        }
        
        // Extract Bearer token
        const tokenMatch = authHeader.match(/^Bearer (.+)$/);
        if (!tokenMatch) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid Authorization header format. Expected: Bearer <token>'
                })
            };
        }
        
        const sessionJWT = tokenMatch[1];
        
        // Get session secret from Secrets Manager (for verifying session JWT)
        console.log('Fetching session secret from Secrets Manager...');
        const sessionSecret = await getSessionSecret();
        console.log('Session secret retrieved successfully');
        
        // Verify the session JWT
        let sessionPayload: any;
        try {
            sessionPayload = verifyJWT(sessionJWT, sessionSecret);
            console.log('Session JWT verified successfully');
        } catch (verifyError: any) {
            console.error('JWT verification failed:', verifyError);
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid or expired authentication token',
                    details: verifyError.message
                })
            };
        }
        
        // Extract user info from verified JWT
        const userId = sessionPayload.userId;
        const userEmail = sessionPayload.email;
        const deviceId = sessionPayload.deviceId;
        const isBackdoor = sessionPayload.isBackdoor || false;
        
        if (!userEmail) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    success: false,
                    error: 'User email not found in authentication token'
                })
            };
        }

        if (!userId) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    success: false,
                    error: 'User ID not found in authentication token'
                })
            };
        }

        // Check if user is deactivated
        let isDeactivated = false;
        try {
            isDeactivated = await checkUserDeactivated(userId);
        } catch (validationError: any) {
            console.error('Error checking if user is deactivated:', validationError);
            // If validation fails, allow the request to proceed (fail open for availability)
            // Log the error for investigation
        }
        if (isDeactivated) {
            return {
                statusCode: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Account deactivated',
                    message: 'Your account has been deactivated. Please contact your administrator.'
                })
            };
        }

        // Check user expiration
        let expirationCheck: any = { expired: false };
        try {
            expirationCheck = await validateUserExpiration(userId, sessionPayload.exp);
        } catch (validationError: any) {
            console.error('Error validating user expiration:', validationError);
            // If validation fails, allow the request to proceed (fail open for availability)
            // Log the error for investigation
        }
        if (expirationCheck.expired) {
            return {
                statusCode: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Account expired',
                    message: expirationCheck.reason || 'Your account has expired. Please contact your administrator.'
                })
            };
        }
        
        // Parse request body
        let body: any = {};
        try {
            body = event.body ? JSON.parse(event.body) : {};
            console.log('🔧 ===== GENERATE-URL LAMBDA REQUEST =====');
            console.log('🔧 Raw event.body:', event.body);
            console.log('🔧 Parsed request body:', JSON.stringify(body, null, 2));
        } catch (parseError) {
            console.error('Error parsing request body:', parseError);
            throw new Error('Invalid JSON in request body');
        }
        
        // Extract parameters from request (with defaults)
        const merchantId = body.merchant_id || "acme";
        // Use email from verified JWT (ignore user_email from body for security)
        const userEmailForEmbed = addEmbedToEmail(userEmail);
        const workbookId = body.workbook_id;
        const embedPath = body.embed_path || "papercrane-embedding-gcp/workbook";
        const teams = body.teams || ["all_clients_team", "acme_team"];
        const appletId = body.applet_id;
        const appletName = body.applet_name;
        const pageId = body.page_id;
        const variables = body.variables; // Should be Record<string, string>
        
        console.log('🔧 Extracted parameters:');
        console.log('🔧   merchantId:', merchantId);
        console.log('🔧   userEmail:', userEmailForEmbed);
        console.log('🔧   workbookId:', workbookId);
        console.log('🔧   embedPath:', embedPath);
        console.log('🔧   teams:', teams);
        console.log('🔧   appletId:', appletId);
        console.log('🔧   appletName:', appletName);
        console.log('🔧   page_id (from body):', pageId);
        console.log('🔧   page_id type:', typeof pageId);
        console.log('🔧   variables (from body):', JSON.stringify(variables, null, 2));
        console.log('🔧   variables type:', typeof variables);
        console.log('🔧   variables is object:', variables && typeof variables === 'object');
        console.log('🔧 Processing request with:', {
            merchantId,
            userEmail: userEmailForEmbed,
            workbookId,
            embedPath,
            teams,
            appletId,
            appletName,
            pageId,
            variables,
            authenticatedUser: userEmail
        });
        
        // Get embed secret from Secrets Manager (for signing embed JWT)
        console.log('Fetching embed secret from Secrets Manager...');
        const embedSecret = await getEmbedSecret();
        console.log('Embed secret retrieved successfully');
        
        // Current timestamp
        const now = Math.floor(Date.now() / 1000);
        
        // Create JWT payload
        const payload = {
            sub: userEmailForEmbed,
            aud: "sigmacomputing",
            ver: "1.1",
            jti: generateUUID(), // Unique nonce for each request
            iat: now,
            exp: now + 3600, // Token expires in 1 hour
            user_attributes: {
                merchant_id: merchantId
            },
            account_type: "Creator",
            teams: teams,
            iss: "ff917c5524fa296ed349ea375657ccc721765ff12b0e276cc3cd5873812c4355"
        };
        
        console.log('Creating embed JWT...');
        // Generate JWT using embed secret (this is synchronous, no need to await)
        const jwtToken = createJWT(payload, embedSecret);
        console.log('Embed JWT created successfully');
        
        // Construct the base embedding URL
        // If pageId is provided, add /page/{pageId} to the path
        console.log('🔧 ===== CONSTRUCTING EMBED URL =====');
        let baseUrl = `https://app.sigmacomputing.com/${embedPath}/${workbookId}`;
        console.log('🔧 Base URL (before pageId):', baseUrl);
        if (pageId) {
            baseUrl += `/page/${encodeURIComponent(pageId)}`;
            console.log('🔧 Added pageId to URL path:', pageId);
            console.log('🔧 Base URL (after pageId):', baseUrl);
        } else {
            console.log('🔧 No pageId provided, skipping /page/{pageId}');
        }
        
        // Start building query parameters
        // Flag to toggle URL encoding - set to false to disable encoding
        const ENABLE_URL_ENCODING = false;
        
        let embeddingUrl: string;
        
        if (ENABLE_URL_ENCODING) {
            // Use URLSearchParams for automatic encoding
            const queryParams = new URLSearchParams();
            queryParams.append(':jwt', jwtToken);
            queryParams.append(':embed', 'true');
            queryParams.append(':menu_position', 'none');
            console.log('🔧 Base query params:', queryParams.toString());
            
            // Add variables as query parameters if provided
            if (variables && typeof variables === 'object') {
                console.log('🔧 Adding variables to query params:');
                for (const [key, value] of Object.entries(variables)) {
                    if (key && value !== null && value !== undefined) {
                        queryParams.append(key, String(value));
                        console.log(`🔧   Added: ${key} = ${String(value)}`);
                    }
                }
            } else {
                console.log('🔧 No variables provided or variables is not an object');
            }
            
            embeddingUrl = `${baseUrl}?${queryParams.toString()}`;
        } else {
            // Build query string manually without encoding
            const queryParts: string[] = [];
            queryParts.push(`:jwt=${jwtToken}`);
            queryParts.push(`:embed=true`);
            queryParts.push(`:menu_position=none`);
            console.log('🔧 Base query params (unencoded):', queryParts.join('&'));
            
            // Add variables as query parameters if provided
            if (variables && typeof variables === 'object') {
                console.log('🔧 Adding variables to query params (unencoded):');
                for (const [key, value] of Object.entries(variables)) {
                    if (key && value !== null && value !== undefined) {
                        queryParts.push(`${key}=${String(value)}`);
                        console.log(`🔧   Added (unencoded): ${key} = ${String(value)}`);
                    }
                }
            } else {
                console.log('🔧 No variables provided or variables is not an object');
            }
            
            embeddingUrl = `${baseUrl}?${queryParts.join('&')}`;
        }
        
        console.log('🔧 Final embedding URL:', embeddingUrl);
        console.log('🔧 ===== END CONSTRUCTING EMBED URL =====');
        
        // Log activity and update last active time (don't let failures break the main flow)
        const ipAddress = getIpAddress(event);
        try {
            const activityMetadata: Record<string, any> = {
                merchantId
            };
            if (appletId) {
                activityMetadata.appletId = appletId;
            }
            if (appletName) {
                activityMetadata.appletName = appletName;
            }
            
            const emailForLogging = getActivityLogEmail(userEmail, isBackdoor);
            console.log('[generate-url] Logging applet_launch activity:', {
                userId,
                originalEmail: userEmail,
                isBackdoor,
                emailForLogging
            });
            
            await logActivityAndUpdateLastActive(
                'applet_launch',
                userId,
                emailForLogging,
                activityMetadata,
                deviceId,
                ipAddress
            );
        } catch (activityError: any) {
            // Log the error but don't fail the request - activity logging is non-critical
            console.error('Failed to log activity:', activityError?.statusCode || activityError?.message || activityError);
            // Continue with the response even if activity logging failed
        }
        
        console.log('Returning success response');
        // Return success response
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify({
                success: true,
                url: embeddingUrl,
                jwt: jwtToken,
                expires_at: payload.exp
            })
        };
        
    } catch (error: any) {
        console.error('❌ Lambda error:', error);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error name:', error.name);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error statusCode:', error.statusCode);
        
        // Log additional context for debugging
        if (error.$metadata) {
            console.error('❌ AWS SDK metadata:', JSON.stringify(error.$metadata, null, 2));
        }
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: false,
                error: errorMessage,
                details: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    code: (error as any).code,
                    statusCode: (error as any).statusCode
                } : undefined
            })
        };
    }
};

