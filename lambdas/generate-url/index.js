import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import crypto from 'crypto';

// Get AWS region from environment or default to us-west-2
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';

// Initialize Secrets Manager client
const secretsManager = new SecretsManagerClient({ region: AWS_REGION });

// Cache the secrets to avoid repeated calls
let cachedSessionSecret = null;
let cachedEmbedSecret = null;

/**
 * Get session JWT secret (for verifying user session JWTs)
 * Uses mobile-app/jwt-secret, stored as plain string
 */
async function getSessionSecret() {
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
    } catch (error) {
        console.error('Error fetching session secret from Secrets Manager:', error);
        throw new Error(`Failed to fetch session JWT secret: ${error.message}`);
    }
}

/**
 * Get embed JWT secret (for signing Sigma embed JWTs)
 * Uses sigma/jwt-secret, stored as JSON with JWT_SECRET field
 */
async function getEmbedSecret() {
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
    } catch (error) {
        console.error('Error fetching embed secret from Secrets Manager:', error);
        throw new Error(`Failed to fetch embed JWT secret: ${error.message}`);
    }
}

function base64UrlEncode(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function generateUUID() {
    return crypto.randomUUID();
}

function addEmbedToEmail(email) {
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
function verifyJWT(token, secret) {
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

function createJWT(payload, secret) {
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

export const handler = async (event) => {
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
        let sessionPayload;
        try {
            sessionPayload = verifyJWT(sessionJWT, sessionSecret);
            console.log('Session JWT verified successfully');
        } catch (verifyError) {
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
        
        // Extract user email from verified JWT
        const userEmail = sessionPayload.email;
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
        
        // Parse request body
        let body = {};
        try {
            body = event.body ? JSON.parse(event.body) : {};
            console.log('Parsed request body:', JSON.stringify(body, null, 2));
        } catch (parseError) {
            console.error('Error parsing request body:', parseError);
            throw new Error('Invalid JSON in request body');
        }
        
        // Extract parameters from request (with defaults)
        const merchantId = body.merchant_id || "acme";
        // Use email from verified JWT (ignore user_email from body for security)
        const userEmailForEmbed = addEmbedToEmail(userEmail);
        const workbookId = body.workbook_id || "6vzpQFMQkEiBIbnybiwrH3";
        const embedPath = body.embed_path || "papercrane-embedding-gcp/workbook";
        const teams = body.teams || ["all_clients_team", "acme_team"];
        
        console.log('Processing request with:', {
            merchantId,
            userEmail: userEmailForEmbed,
            workbookId,
            embedPath,
            teams,
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
            account_type: "Viewer",
            teams: teams,
            iss: "ff917c5524fa296ed349ea375657ccc721765ff12b0e276cc3cd5873812c4355"
        };
        
        console.log('Creating embed JWT...');
        // Generate JWT using embed secret (this is synchronous, no need to await)
        const jwt = createJWT(payload, embedSecret);
        console.log('Embed JWT created successfully');
        
        // Construct the full embedding URL
        const embeddingUrl = `https://app.sigmacomputing.com/${embedPath}/${workbookId}?:jwt=${jwt}&:embed=true&:menu_position=none`;
        
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
                jwt: jwt,
                expires_at: payload.exp
            })
        };
        
    } catch (error) {
        console.error('❌ Lambda error:', error);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error name:', error.name);
        console.error('❌ Error message:', error.message);
        
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
                    message: error.message
                } : undefined
            })
        };
    }
};

