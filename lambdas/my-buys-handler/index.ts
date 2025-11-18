/**
 * My Buys Lambda Handler
 * Handles CRUD operations for user's custom Sigma workbook embeds
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import crypto from 'crypto';
import { validateUserExpiration, checkUserDeactivated } from '../shared/user-validation';
import { logActivityAndUpdateLastActive, getActivityLogEmail } from '../shared/activity-logger';

// Get AWS region from environment or default to us-west-2
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const kmsClient = new KMSClient({ region: AWS_REGION });
const secretsManager = new SecretsManagerClient({ region: AWS_REGION });

// Environment variables
const MY_BUYS_TABLE = process.env.MY_BUYS_TABLE || 'mobile-my-buys-applets';
const MY_BUYS_SECRETS_TABLE = process.env.MY_BUYS_SECRETS_TABLE || 'mobile-my-buys-secrets';
const KMS_KEY_ALIAS = process.env.KMS_KEY_ALIAS || 'alias/mobile-my-buys-secrets';
const JWT_SECRET_NAME = process.env.JWT_SECRET_NAME || 'mobile-app/jwt-secret';
const ACTIVITY_TABLE = process.env.ACTIVITY_TABLE || 'mobile-user-activity';
const MAX_APPLETS_PER_USER = 50;

// Cache for session JWT secret
let cachedSessionSecret: string | null = null;

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
 */
async function getSessionSecret(): Promise<string> {
    if (cachedSessionSecret) {
        return cachedSessionSecret;
    }
    
    try {
        const command = new GetSecretValueCommand({
            SecretId: JWT_SECRET_NAME
        });
        
        const response = await secretsManager.send(command);
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
 * Verify JWT signature and expiration
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

/**
 * Base64 URL encode
 */
function base64UrlEncode(str: string): string {
    return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(str: string): string {
    // Add padding if needed
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString();
}

/**
 * Generate UUID
 */
function generateUUID(): string {
    return crypto.randomUUID();
}

/**
 * Encrypt secret using KMS
 */
async function encryptSecret(secret: string): Promise<string> {
    try {
        const command = new EncryptCommand({
            KeyId: KMS_KEY_ALIAS,
            Plaintext: Buffer.from(secret, 'utf-8'),
        });
        
        const response = await kmsClient.send(command);
        
        if (!response.CiphertextBlob) {
            throw new Error('KMS encryption returned no ciphertext');
        }
        
        // Return base64 encoded ciphertext for storage in DynamoDB
        return Buffer.from(response.CiphertextBlob).toString('base64');
    } catch (error: any) {
        console.error('Error encrypting secret:', error);
        throw new Error(`Failed to encrypt secret: ${error.message}`);
    }
}

/**
 * Decrypt secret using KMS
 */
async function decryptSecret(encryptedSecret: string): Promise<string> {
    try {
        const ciphertextBlob = Buffer.from(encryptedSecret, 'base64');
        
        const command = new DecryptCommand({
            CiphertextBlob: ciphertextBlob,
        });
        
        const response = await kmsClient.send(command);
        
        if (!response.Plaintext) {
            throw new Error('KMS decryption returned no plaintext');
        }
        
        return Buffer.from(response.Plaintext).toString('utf-8');
    } catch (error: any) {
        console.error('Error decrypting secret:', error);
        throw new Error(`Failed to decrypt secret: ${error.message}`);
    }
}

/**
 * Parse embed URL and extract secret name (e.g., "papercrane" from sigmacomputing.com/papercrane/workbook/...)
 */
function extractSecretNameFromUrl(url: string): string | null {
    try {
        // Extract the name from URL pattern: https://app.sigmacomputing.com/{name}/workbook/...
        const match = url.match(/app\.sigmacomputing\.com\/([^\/]+)\//);
        if (match && match[1]) {
            return match[1];
        }
        return null;
    } catch (error: any) {
        console.error('Error extracting secret name from URL:', error);
        return null;
    }
}

/**
 * Parse embed URL and extract JWT
 */
function parseEmbedUrl(url: string): { baseUrl: string, jwt: string, params: Record<string, string> } {
    try {
        // Validate URL format
        if (!url.includes('app.sigmacomputing.com')) {
            throw new Error('Embed URL must be from app.sigmacomputing.com');
        }
        
        // Extract JWT from URL
        const jwtMatch = url.match(/[?&]:jwt=([^&]+)/);
        if (!jwtMatch || !jwtMatch[1]) {
            throw new Error('Embed URL must contain ?:jwt= parameter');
        }
        
        const jwt = jwtMatch[1];
        
        // Extract base URL (everything before ?:jwt=)
        const baseUrl = url.split('?:jwt=')[0].split('&:jwt=')[0];
        
        // Extract other parameters
        const params: Record<string, string> = {};
        const urlObj = new URL(url);
        urlObj.searchParams.forEach((value, key) => {
            params[key] = value;
        });
        
        return { baseUrl, jwt, params };
    } catch (error: any) {
        if (error.message.includes('Embed URL')) {
            throw error;
        }
        throw new Error(`Invalid embed URL format: ${error.message}`);
    }
}

/**
 * Decode JWT without verification (for extracting payload)
 */
function decodeJWT(token: string): { header: any, payload: any } {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
    }
    
    const [encodedHeader, encodedPayload] = parts;
    
    try {
        const header = JSON.parse(base64UrlDecode(encodedHeader));
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        
        return { header, payload };
    } catch (error: any) {
        throw new Error(`Failed to decode JWT: ${error.message}`);
    }
}

/**
 * Regenerate JWT with new jti, kid, and exp
 */
function regenerateJWT(originalJWT: string, clientId: string, secret: string): string {
    // Decode original JWT
    const { header, payload } = decodeJWT(originalJWT);
    
    // Create new header with updated kid
    const newHeader = {
        alg: header.alg || 'HS256',
        typ: header.typ || 'JWT',
        kid: clientId
    };
    
    // Create new payload with updated jti and exp
    const now = Math.floor(Date.now() / 1000);
    const newPayload = {
        ...payload,
        jti: generateUUID(),
        iat: now,
        exp: now + 3600 // 1 hour from now
    };
    
    // Encode header and payload
    const encodedHeader = base64UrlEncode(JSON.stringify(newHeader));
    const encodedPayload = base64UrlEncode(JSON.stringify(newPayload));
    
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

/**
 * Get secret from secrets table by name and userId (row-level security)
 */
async function getSecretByName(userId: string, secretName: string): Promise<{ clientId: string, secret: string } | null> {
    try {
        const result = await docClient.send(new GetCommand({
            TableName: MY_BUYS_SECRETS_TABLE,
            Key: { userId, secretName }
        }));
        
        if (!result.Item) {
            return null;
        }
        
        // Decrypt the secret
        const decryptedSecret = await decryptSecret(result.Item.encryptedSecret);
        
        return {
            clientId: result.Item.clientId,
            secret: decryptedSecret
        };
    } catch (error: any) {
        console.error('Error getting secret by name:', error);
        throw new Error(`Failed to get secret: ${error.message}`);
    }
}

/**
 * Create or update secret in secrets table (row-level security per user)
 */
async function saveSecret(userId: string, secretName: string, clientId: string, secret: string): Promise<void> {
    try {
        // Encrypt the secret
        const encryptedSecret = await encryptSecret(secret);
        
        const now = Math.floor(Date.now() / 1000);
        
        // Check if secret already exists for this user
        const existing = await docClient.send(new GetCommand({
            TableName: MY_BUYS_SECRETS_TABLE,
            Key: { userId, secretName }
        }));
        
        if (existing.Item) {
            // Update existing secret
            await docClient.send(new UpdateCommand({
                TableName: MY_BUYS_SECRETS_TABLE,
                Key: { userId, secretName },
                UpdateExpression: 'SET clientId = :clientId, encryptedSecret = :encryptedSecret, updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                    ':clientId': clientId,
                    ':encryptedSecret': encryptedSecret,
                    ':updatedAt': now
                }
            }));
        } else {
            // Create new secret
            await docClient.send(new PutCommand({
                TableName: MY_BUYS_SECRETS_TABLE,
                Item: {
                    userId,
                    secretName,
                    clientId,
                    encryptedSecret,
                    createdAt: now,
                    updatedAt: now
                }
            }));
        }
    } catch (error: any) {
        console.error('Error saving secret:', error);
        throw new Error(`Failed to save secret: ${error.message}`);
    }
}

/**
 * Test embed URL by making a HEAD request
 */
async function testEmbedUrl(url: string): Promise<{ success: boolean, statusCode: number, message: string }> {
    try {
        const response = await fetch(url, {
            method: 'HEAD',
            redirect: 'follow',
        });
        
        if (response.ok) {
            return {
                success: true,
                statusCode: response.status,
                message: 'Test successful'
            };
        } else {
            return {
                success: false,
                statusCode: response.status,
                message: `HTTP ${response.status}: ${response.statusText}`
            };
        }
    } catch (error: any) {
        return {
            success: false,
            statusCode: 0,
            message: `Network error: ${error.message}`
        };
    }
}

/**
 * Authenticate request and extract user info
 */
async function authenticateRequest(event: any): Promise<{ userId: string, email: string, deviceId?: string, isBackdoor?: boolean }> {
    // Log all headers for debugging
    console.log('Request headers:', JSON.stringify(event.headers || {}, null, 2));
    console.log('Header keys:', Object.keys(event.headers || {}));
    
    // Check multiple possible header name variations (API Gateway may normalize headers)
    const authHeader = event.headers?.Authorization 
        || event.headers?.authorization 
        || event.headers?.['Authorization']
        || event.headers?.['authorization']
        || event.multiValueHeaders?.['Authorization']?.[0]
        || event.multiValueHeaders?.['authorization']?.[0];
    
    console.log('Authorization header found:', !!authHeader);
    console.log('Authorization header length:', authHeader?.length || 0);
    console.log('Authorization header starts with Bearer:', authHeader?.startsWith('Bearer ') || false);
    
    if (!authHeader) {
        console.error('Missing Authorization header. Available headers:', Object.keys(event.headers || {}));
        throw new Error('Missing Authorization header');
    }
    
    // Check if header starts with "Bearer " - if not, it might be just the token
    let sessionJWT: string;
    if (authHeader.startsWith('Bearer ')) {
        sessionJWT = authHeader.substring(7); // Remove "Bearer " prefix
    } else {
        // If no Bearer prefix, assume the whole header is the token
        console.warn('Authorization header does not start with "Bearer ", treating entire header as token');
        sessionJWT = authHeader;
    }
    
    if (!sessionJWT || sessionJWT.trim().length === 0) {
        throw new Error('Invalid Authorization header: token is empty');
    }
    
    const sessionSecret = await getSessionSecret();
    const sessionPayload = verifyJWT(sessionJWT, sessionSecret);
    
    const userId = sessionPayload.userId;
    const email = sessionPayload.email;
    const deviceId = sessionPayload.deviceId;
    const isBackdoor = sessionPayload.isBackdoor || false;
    
    if (!userId || !email) {
        throw new Error('Invalid authentication token: missing userId or email');
    }
    
    // Check if user is deactivated
    const isDeactivated = await checkUserDeactivated(userId);
    if (isDeactivated) {
        throw new Error('Account deactivated');
    }
    
    // Check user expiration
    const expirationCheck = await validateUserExpiration(userId, sessionPayload.exp);
    if (expirationCheck.expired) {
        throw new Error(expirationCheck.reason || 'Account expired');
    }
    
    return { userId, email, deviceId, isBackdoor };
}

/**
 * Create response helper
 */
function createResponse(statusCode: number, body: any, headers: Record<string, string> = {}) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            ...headers
        },
        body: JSON.stringify(body)
    };
}

/**
 * Handle OPTIONS request (CORS preflight)
 */
function handleOptions(): any {
    return createResponse(200, {});
}

/**
 * Handle POST /v1/my-buys/applets - Create applet
 */
async function handleCreateApplet(event: any, userId: string, email: string, deviceId?: string, isBackdoor?: boolean): Promise<any> {
    const body = JSON.parse(event.body || '{}');
    const { name, embedUrl, embedClientId, embedSecretKey } = body;
    
    // Validate required fields
    if (!name || !embedUrl || !embedClientId || !embedSecretKey) {
        return createResponse(400, {
            success: false,
            error: 'Missing required fields',
            message: 'Name, embed URL, embed client ID, and embed secret key are required'
        });
    }
    
    // Validate name length
    if (name.length > 35) {
        return createResponse(400, {
            success: false,
            error: 'Name too long',
            message: 'Name must be 35 characters or less'
        });
    }
    
    // Validate embed URL format
    let parsedUrl;
    try {
        parsedUrl = parseEmbedUrl(embedUrl);
    } catch (error: any) {
        return createResponse(400, {
            success: false,
            error: 'Invalid embed URL',
            message: error.message
        });
    }
    
    // Validate JWT structure
    try {
        decodeJWT(parsedUrl.jwt);
    } catch (error: any) {
        return createResponse(400, {
            success: false,
            error: 'Invalid JWT in embed URL',
            message: error.message
        });
    }
    
    // Check applet limit
    const existingApplets = await docClient.send(new QueryCommand({
        TableName: MY_BUYS_TABLE,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
            ':userId': userId
        },
        Select: 'COUNT'
    }));
    
    if ((existingApplets.Count || 0) >= MAX_APPLETS_PER_USER) {
        return createResponse(400, {
            success: false,
            error: 'Applet limit reached',
            message: `Maximum of ${MAX_APPLETS_PER_USER} applets allowed per user`
        });
    }
    
    // Extract secret name from URL and save/update secret in secrets table
    const secretName = extractSecretNameFromUrl(embedUrl);
    if (!secretName) {
        return createResponse(400, {
            success: false,
            error: 'Invalid embed URL',
            message: 'Could not extract secret name from embed URL'
        });
    }
    
    // Save secret to secrets table (will create or update) - row-level security per user
    await saveSecret(userId, secretName, embedClientId, embedSecretKey);
    
    // Create applet (store reference to secret name instead of encrypted secret)
    const appletId = generateUUID();
    const now = Math.floor(Date.now() / 1000);
    
    const applet = {
        userId,
        appletId,
        name,
        embedUrl,
        secretName, // Store reference to secret instead of encryptedSecret and embedClientId
        createdAt: now,
        updatedAt: now
    };
    
    await docClient.send(new PutCommand({
        TableName: MY_BUYS_TABLE,
        Item: applet
    }));
    
    // Log activity
    const ipAddress = getIpAddress(event);
    await logActivityAndUpdateLastActive(
        'my_buys_applet_created',
        userId,
        getActivityLogEmail(email, isBackdoor),
        { appletId, appletName: name },
        deviceId,
        ipAddress
    );
    
    return createResponse(201, {
        success: true,
        applet: {
            appletId,
            name,
            embedUrl,
            createdAt: now,
            updatedAt: now
        }
    });
}

/**
 * Handle GET /v1/my-buys/applets - List applets
 */
async function handleListApplets(userId: string): Promise<any> {
    const result = await docClient.send(new QueryCommand({
        TableName: MY_BUYS_TABLE,
        IndexName: 'userId-createdAt-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
            ':userId': userId
        },
        ScanIndexForward: false // Newest first
    }));
    
    const applets = (result.Items || []).map((item: any) => ({
        appletId: item.appletId,
        name: item.name,
        embedUrl: item.embedUrl,
        secretName: item.secretName, // Include secretName for reference
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
    }));
    
    return createResponse(200, {
        success: true,
        applets
    });
}

/**
 * Handle PUT /v1/my-buys/applets/{appletId} - Update applet
 */
async function handleUpdateApplet(event: any, userId: string, email: string, deviceId?: string, isBackdoor?: boolean): Promise<any> {
    const appletId = event.pathParameters?.appletId;
    if (!appletId) {
        return createResponse(400, {
            success: false,
            error: 'Missing appletId'
        });
    }
    
    // Verify applet belongs to user
    const existing = await docClient.send(new GetCommand({
        TableName: MY_BUYS_TABLE,
        Key: { userId, appletId }
    }));
    
    if (!existing.Item) {
        return createResponse(404, {
            success: false,
            error: 'Applet not found'
        });
    }
    
    const body = JSON.parse(event.body || '{}');
    const { name, embedUrl, embedClientId, embedSecretKey } = body;
    
    // Validate required fields
    if (!name || !embedUrl || !embedClientId || !embedSecretKey) {
        return createResponse(400, {
            success: false,
            error: 'Missing required fields',
            message: 'Name, embed URL, embed client ID, and embed secret key are required'
        });
    }
    
    // Validate name length
    if (name.length > 35) {
        return createResponse(400, {
            success: false,
            error: 'Name too long',
            message: 'Name must be 35 characters or less'
        });
    }
    
    // Validate embed URL format
    let parsedUrl;
    try {
        parsedUrl = parseEmbedUrl(embedUrl);
    } catch (error: any) {
        return createResponse(400, {
            success: false,
            error: 'Invalid embed URL',
            message: error.message
        });
    }
    
    // Validate JWT structure
    try {
        decodeJWT(parsedUrl.jwt);
    } catch (error: any) {
        return createResponse(400, {
            success: false,
            error: 'Invalid JWT in embed URL',
            message: error.message
        });
    }
    
    // Extract secret name from URL and save/update secret in secrets table
    const secretName = extractSecretNameFromUrl(embedUrl);
    if (!secretName) {
        return createResponse(400, {
            success: false,
            error: 'Invalid embed URL',
            message: 'Could not extract secret name from embed URL'
        });
    }
    
    // Save secret to secrets table (will create or update) - row-level security per user
    await saveSecret(userId, secretName, embedClientId, embedSecretKey);
    
    // Update applet (store reference to secret name instead of encrypted secret)
    const now = Math.floor(Date.now() / 1000);
    
    await docClient.send(new UpdateCommand({
        TableName: MY_BUYS_TABLE,
        Key: { userId, appletId },
        UpdateExpression: 'SET #name = :name, embedUrl = :embedUrl, secretName = :secretName, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
            '#name': 'name'
        },
        ExpressionAttributeValues: {
            ':name': name,
            ':embedUrl': embedUrl,
            ':secretName': secretName,
            ':updatedAt': now
        }
    }));
    
    // Log activity
    const ipAddress = getIpAddress(event);
    await logActivityAndUpdateLastActive(
        'my_buys_applet_updated',
        userId,
        getActivityLogEmail(email, isBackdoor),
        { appletId, appletName: name },
        deviceId,
        ipAddress
    );
    
    return createResponse(200, {
        success: true,
        applet: {
            appletId,
            name,
            embedUrl,
            createdAt: existing.Item.createdAt,
            updatedAt: now
        }
    });
}

/**
 * Handle DELETE /v1/my-buys/applets/{appletId} - Delete applet
 */
async function handleDeleteApplet(event: any, userId: string, email: string, deviceId?: string, isBackdoor?: boolean): Promise<any> {
    const appletId = event.pathParameters?.appletId;
    if (!appletId) {
        return createResponse(400, {
            success: false,
            error: 'Missing appletId'
        });
    }
    
    // Verify applet belongs to user and get name for logging
    const existing = await docClient.send(new GetCommand({
        TableName: MY_BUYS_TABLE,
        Key: { userId, appletId }
    }));
    
    if (!existing.Item) {
        return createResponse(404, {
            success: false,
            error: 'Applet not found'
        });
    }
    
    // Delete applet
    await docClient.send(new DeleteCommand({
        TableName: MY_BUYS_TABLE,
        Key: { userId, appletId }
    }));
    
    // Log activity
    const ipAddress = getIpAddress(event);
    await logActivityAndUpdateLastActive(
        'my_buys_applet_deleted',
        userId,
        getActivityLogEmail(email, isBackdoor),
        { appletId, appletName: existing.Item.name },
        deviceId,
        ipAddress
    );
    
    return createResponse(200, {
        success: true,
        message: 'Applet deleted successfully'
    });
}

/**
 * Handle POST /v1/my-buys/applets/{appletId}/test - Test applet configuration
 */
async function handleTestApplet(event: any, userId: string, email: string, deviceId?: string, isBackdoor?: boolean): Promise<any> {
    const appletId = event.pathParameters?.appletId;
    if (!appletId) {
        return createResponse(400, {
            success: false,
            error: 'Missing appletId'
        });
    }
    
    // Get applet
    const applet = await docClient.send(new GetCommand({
        TableName: MY_BUYS_TABLE,
        Key: { userId, appletId }
    }));
    
    if (!applet.Item) {
        return createResponse(404, {
            success: false,
            error: 'Applet not found'
        });
    }
    
    // Get secret from secrets table (row-level security - only this user's secrets)
    if (!applet.Item.secretName) {
        return createResponse(400, {
            success: false,
            error: 'Applet missing secret reference',
            message: 'Applet does not have a secret reference. Please update the applet.'
        });
    }
    
    const secretData = await getSecretByName(userId, applet.Item.secretName);
    if (!secretData) {
        return createResponse(404, {
            success: false,
            error: 'Secret not found',
            message: `Secret "${applet.Item.secretName}" not found in secrets table`
        });
    }
    
    // Parse embed URL
    let parsedUrl;
    try {
        parsedUrl = parseEmbedUrl(applet.Item.embedUrl);
    } catch (error: any) {
        return createResponse(400, {
            success: false,
            error: 'Invalid embed URL',
            message: error.message
        });
    }
    
    // Regenerate JWT
    let regeneratedJWT;
    try {
        regeneratedJWT = regenerateJWT(parsedUrl.jwt, secretData.clientId, secretData.secret);
    } catch (error: any) {
        return createResponse(400, {
            success: false,
            error: 'Failed to regenerate JWT',
            message: error.message
        });
    }
    
    // Construct test URL
    const testUrl = `${parsedUrl.baseUrl}?:jwt=${regeneratedJWT}&:embed=true&:menu_position=none`;
    
    // Test URL
    const testResult = await testEmbedUrl(testUrl);
    
    // Log activity
    const ipAddress = getIpAddress(event);
    await logActivityAndUpdateLastActive(
        'my_buys_applet_tested',
        userId,
        getActivityLogEmail(email, isBackdoor),
        { 
            appletId, 
            appletName: applet.Item.name,
            testSuccess: testResult.success,
            testStatusCode: testResult.statusCode
        },
        deviceId,
        ipAddress
    );
    
    return createResponse(200, {
        success: testResult.success,
        statusCode: testResult.statusCode,
        message: testResult.message,
        url: testUrl
    });
}

/**
 * Handle POST /v1/my-buys/applets/test - Test configuration without creating applet
 */
async function handleTestConfiguration(event: any, userId: string, email: string, deviceId?: string): Promise<any> {
    const body = JSON.parse(event.body || '{}');
    const { embedUrl, embedClientId, embedSecretKey } = body;
    
    if (!embedUrl || !embedClientId || !embedSecretKey) {
        return createResponse(400, {
            success: false,
            error: 'Missing required fields',
            message: 'Embed URL, embed client ID, and embed secret key are required'
        });
    }
    
    // Parse embed URL
    let parsedUrl;
    try {
        parsedUrl = parseEmbedUrl(embedUrl);
    } catch (error: any) {
        return createResponse(400, {
            success: false,
            error: 'Invalid embed URL',
            message: error.message
        });
    }
    
    // Regenerate JWT
    let regeneratedJWT;
    try {
        regeneratedJWT = regenerateJWT(parsedUrl.jwt, embedClientId, embedSecretKey);
    } catch (error: any) {
        return createResponse(400, {
            success: false,
            error: 'Failed to regenerate JWT',
            message: error.message
        });
    }
    
    // Construct test URL
    const testUrl = `${parsedUrl.baseUrl}?:jwt=${regeneratedJWT}&:embed=true&:menu_position=none`;
    
    // Test URL
    const testResult = await testEmbedUrl(testUrl);
    
    return createResponse(200, {
        success: testResult.success,
        statusCode: testResult.statusCode,
        message: testResult.message,
        url: testUrl
    });
}

/**
 * Handle POST /v1/my-buys/applets/{appletId}/regenerate-url - Get regenerated embed URL
 */
async function handleRegenerateUrl(event: any, userId: string, email: string, deviceId?: string, isBackdoor?: boolean): Promise<any> {
    const appletId = event.pathParameters?.appletId;
    if (!appletId) {
        return createResponse(400, {
            success: false,
            error: 'Missing appletId'
        });
    }
    
    // Get applet
    const applet = await docClient.send(new GetCommand({
        TableName: MY_BUYS_TABLE,
        Key: { userId, appletId }
    }));
    
    if (!applet.Item) {
        return createResponse(404, {
            success: false,
            error: 'Applet not found'
        });
    }
    
    // Get secret from secrets table (row-level security - only this user's secrets)
    if (!applet.Item.secretName) {
        return createResponse(400, {
            success: false,
            error: 'Applet missing secret reference',
            message: 'Applet does not have a secret reference. Please update the applet.'
        });
    }
    
    const secretData = await getSecretByName(userId, applet.Item.secretName);
    if (!secretData) {
        return createResponse(404, {
            success: false,
            error: 'Secret not found',
            message: `Secret "${applet.Item.secretName}" not found in secrets table`
        });
    }
    
    // Parse embed URL
    let parsedUrl;
    try {
        parsedUrl = parseEmbedUrl(applet.Item.embedUrl);
    } catch (error: any) {
        return createResponse(400, {
            success: false,
            error: 'Invalid embed URL',
            message: error.message
        });
    }
    
    // Regenerate JWT
    let regeneratedJWT;
    try {
        regeneratedJWT = regenerateJWT(parsedUrl.jwt, secretData.clientId, secretData.secret);
    } catch (error: any) {
        return createResponse(400, {
            success: false,
            error: 'Failed to regenerate JWT',
            message: error.message
        });
    }
    
    // Construct regenerated URL
    const regeneratedUrl = `${parsedUrl.baseUrl}?:jwt=${regeneratedJWT}&:embed=true&:menu_position=none`;
    
    // Log activity
    const ipAddress = getIpAddress(event);
    await logActivityAndUpdateLastActive(
        'my_buys_applet_viewed',
        userId,
        getActivityLogEmail(email, isBackdoor),
        { appletId, appletName: applet.Item.name },
        deviceId,
        ipAddress
    );
    
    return createResponse(200, {
        success: true,
        url: regeneratedUrl,
        jwt: regeneratedJWT,
        expiresAt: Math.floor(Date.now() / 1000) + 3600
    });
}

/**
 * Handle GET /v1/my-buys/secrets/{secretName} - Get secret by name (for auto-population)
 * Row-level security: users can only access their own secrets
 */
async function handleGetSecretByName(event: any, userId: string, email: string, deviceId?: string): Promise<any> {
    // Try to get secretName from pathParameters first
    let secretName = event.pathParameters?.secretName;
    
    // If not in pathParameters, extract from path
    if (!secretName) {
        const path = event.path || event.rawPath || event.requestContext?.path || '';
        // Extract secretName from path like /my-buys/secrets/{secretName} or /v1/my-buys/secrets/{secretName}
        const match = path.match(/\/secrets\/([^\/\?]+)/);
        if (match && match[1]) {
            secretName = decodeURIComponent(match[1]);
        }
    }
    
    if (!secretName) {
        return createResponse(400, {
            success: false,
            error: 'Missing secretName',
            message: 'Secret name is required'
        });
    }
    
    // Get secret from secrets table (row-level security - only this user's secrets)
    const secretData = await getSecretByName(userId, secretName);
    if (!secretData) {
        return createResponse(404, {
            success: false,
            error: 'Secret not found',
            message: `Secret "${secretName}" not found`
        });
    }
    
    return createResponse(200, {
        success: true,
        secret: {
            secretName,
            clientId: secretData.clientId,
            secretKey: secretData.secret // Return secret for auto-population
        }
    });
}

/**
 * Main Lambda handler
 */
export const handler = async (event: any) => {
    console.log('My Buys Lambda handler invoked');
    console.log('Event:', JSON.stringify(event, null, 2));
    
    try {
        // Handle OPTIONS request (CORS preflight)
        if (event.httpMethod === 'OPTIONS') {
            return handleOptions();
        }
        
        // Authenticate request
        let userInfo;
        try {
            userInfo = await authenticateRequest(event);
        } catch (authError: any) {
            if (authError.message === 'Account deactivated') {
                return createResponse(403, {
                    success: false,
                    error: 'Account deactivated',
                    message: 'Your account has been deactivated. Please contact your administrator.'
                });
            }
            if (authError.message.includes('expired')) {
                return createResponse(403, {
                    success: false,
                    error: 'Account expired',
                    message: authError.message
                });
            }
            return createResponse(401, {
                success: false,
                error: 'Authentication failed',
                message: authError.message
            });
        }
        
        const { userId, email, deviceId, isBackdoor } = userInfo;
        let path = event.path || event.rawPath || event.requestContext?.path || '';
        const method = event.httpMethod || event.requestContext?.httpMethod || '';
        
        // Log all path-related fields for debugging
        console.log('=== PATH DEBUGGING ===');
        console.log('event.path:', event.path);
        console.log('event.rawPath:', event.rawPath);
        console.log('event.requestContext?.path:', event.requestContext?.path);
        console.log('event.requestContext?.resourcePath:', event.requestContext?.resourcePath);
        console.log('Initial path variable:', path);
        console.log('Method:', method);
        
        // Normalize path - API Gateway with AWS_PROXY may send path with or without stage prefix
        // Based on admin-handler behavior, API Gateway sends paths WITH stage prefix in event.path
        // Resources are at /my-buys/applets (not /v1/my-buys/applets)
        // But API Gateway sends /v1/my-buys/applets in event.path
        // Normalize to /my-buys/applets format (without /v1 prefix)
        const originalPath = path;
        if (path.startsWith('/v1/my-buys/')) {
            path = path.replace('/v1/my-buys/', '/my-buys/');
            console.log(`Normalized from /v1/my-buys/ to: ${path}`);
        } else if (path.startsWith('/v1/v1/my-buys/')) {
            path = path.replace('/v1/v1/my-buys/', '/my-buys/');
            console.log(`Normalized from /v1/v1/my-buys/ to: ${path}`);
        } else if (path.startsWith('/my-buys/')) {
            // Already in correct format
            console.log(`Path already in correct format: ${path}`);
        } else if (path.startsWith('/v1/')) {
            // Generic /v1/ prefix removal
            path = path.substring(3);
            console.log(`Removed generic /v1 prefix, new path: ${path}`);
        } else {
            console.log(`Path doesn't match expected patterns, keeping as-is: ${path}`);
        }
        
        console.log(`Final routing path: ${path}, method: ${method}`);
        console.log('====================');
        
        // Route to appropriate handler (paths are now normalized to /my-buys/applets format)
        if (path === '/my-buys/applets' && method === 'POST') {
            return await handleCreateApplet(event, userId, email, deviceId, isBackdoor);
        } else if (path === '/my-buys/applets' && method === 'GET') {
            return await handleListApplets(userId);
        } else if (path === '/my-buys/applets/test' && method === 'POST') {
            return await handleTestConfiguration(event, userId, email, deviceId);
        } else if (path.includes('/secrets/') && method === 'GET') {
            // Path like /my-buys/secrets/{secretName}
            return await handleGetSecretByName(event, userId, email, deviceId);
        } else if (path.includes('/applets/') && path.includes('/test') && method === 'POST') {
            // Path like /my-buys/applets/{appletId}/test
            return await handleTestApplet(event, userId, email, deviceId, isBackdoor);
        } else if (path.includes('/applets/') && path.includes('/regenerate-url') && method === 'POST') {
            // Path like /my-buys/applets/{appletId}/regenerate-url
            return await handleRegenerateUrl(event, userId, email, deviceId, isBackdoor);
        } else if (path.includes('/applets/') && method === 'PUT') {
            // Path like /my-buys/applets/{appletId}
            return await handleUpdateApplet(event, userId, email, deviceId, isBackdoor);
        } else if (path.includes('/applets/') && method === 'DELETE') {
            // Path like /my-buys/applets/{appletId}
            return await handleDeleteApplet(event, userId, email, deviceId, isBackdoor);
        } else {
            return createResponse(404, {
                success: false,
                error: 'Not found',
                message: `No handler for ${method} ${path}`
            });
        }
        
    } catch (error: any) {
        console.error('Lambda error:', error);
        console.error('Error stack:', error.stack);
        
        return createResponse(500, {
            success: false,
            error: 'Internal server error',
            message: error.message || 'An unexpected error occurred'
        });
    }
};

