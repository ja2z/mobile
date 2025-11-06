import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import crypto from 'crypto';

// Get AWS region from environment or default to us-west-2
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';

// Initialize Secrets Manager client
const secretsManager = new SecretsManagerClient({ region: AWS_REGION });

// Cache the secret to avoid repeated calls
let cachedSecret = null;

async function getSecret() {
    if (cachedSecret) {
        console.log('Using cached secret');
        return cachedSecret;
    }
    
    try {
        console.log(`Fetching secret from Secrets Manager in region: ${AWS_REGION}`);
        const command = new GetSecretValueCommand({
            SecretId: "sigma/jwt-secret"
        });
        
        const response = await secretsManager.send(command);
        console.log('Secret retrieved successfully');
        
        const secret = JSON.parse(response.SecretString || '{}');
        const jwtSecret = secret.JWT_SECRET;
        
        if (!jwtSecret) {
            throw new Error('JWT_SECRET not found in secrets manager response');
        }
        
        cachedSecret = jwtSecret;
        return jwtSecret;
    } catch (error) {
        console.error('Error fetching secret from Secrets Manager:', error);
        throw new Error(`Failed to fetch JWT secret: ${error.message}`);
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
        // Get user email from body and add +embed to username if provided, otherwise use default
        const rawUserEmail = body.user_email || "jon@sigmacomputing.com";
        const userEmail = addEmbedToEmail(rawUserEmail);
        const workbookId = body.workbook_id || "6vzpQFMQkEiBIbnybiwrH3";
        const embedPath = body.embed_path || "papercrane-embedding-gcp/workbook";
        const teams = body.teams || ["all_clients_team", "acme_team"];
        
        console.log('Processing request with:', {
            merchantId,
            userEmail,
            workbookId,
            embedPath,
            teams
        });

        // Get secret from Secrets Manager
        console.log('Fetching secret from Secrets Manager...');
        const secret = await getSecret();
        console.log('Secret retrieved successfully');
        
        // Current timestamp
        const now = Math.floor(Date.now() / 1000);
        
        // Create JWT payload
        const payload = {
            sub: userEmail,
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
        
        console.log('Creating JWT...');
        // Generate JWT (this is synchronous, no need to await)
        const jwt = createJWT(payload, secret);
        console.log('JWT created successfully');
        
        // Construct the full embedding URL
        const embeddingUrl = `https://app.sigmacomputing.com/${embedPath}/${workbookId}?:jwt=${jwt}&:embed=true&:menu_position=none`;
        
        console.log('Returning success response');
        // Return success response
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // Adjust for your domain
                'Access-Control-Allow-Headers': 'Content-Type',
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

