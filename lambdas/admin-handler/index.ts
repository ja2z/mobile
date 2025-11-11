/**
 * Admin Lambda Handler
 * Handles admin operations: user management, whitelist management, and activity logs
 * All routes require admin role in JWT
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as jwt from 'jsonwebtoken';
import { validateRole, getUserProfile, getUserProfileByEmail } from '../shared/user-validation';
import { logActivity } from '../shared/activity-logger';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const secretsClient = new SecretsManagerClient({});

// Environment variables
const USERS_TABLE = process.env.USERS_TABLE || 'mobile-users';
const APPROVED_EMAILS_TABLE = process.env.APPROVED_EMAILS_TABLE || 'mobile-approved-emails';
const ACTIVITY_TABLE = process.env.ACTIVITY_TABLE || 'mobile-user-activity';
const TOKENS_TABLE = process.env.TOKENS_TABLE || 'mobile-auth-tokens';
const JWT_SECRET_NAME = process.env.JWT_SECRET_NAME || 'mobile-app/jwt-secret';

// Cache for secrets
let jwtSecret: string | null = null;

/**
 * Main Lambda handler - routes to appropriate function based on path
 */
export const handler = async (event: any) => {
  console.log('Admin Lambda received event:', JSON.stringify(event, null, 2));

  try {
    let path = event.path || event.rawPath;
    const method = event.httpMethod || event.requestContext?.http?.method;

    console.log(`Admin Lambda - Path: ${path}, Method: ${method}`);

    // Normalize path
    if (path.startsWith('/v1/v1/')) {
      path = path.replace('/v1/v1/', '/v1/');
    } else if (path.startsWith('/admin/')) {
      path = '/v1' + path;
    }

    // Parse body for POST/PUT requests
    let body: any = {};
    if ((method === 'POST' || method === 'PUT') && event.body) {
      try {
        body = JSON.parse(event.body);
      } catch (e) {
        return createResponse(400, { error: 'Invalid JSON in request body' });
      }
    }

    // Parse query parameters for GET requests
    const queryParams = event.queryStringParameters || {};

    // Extract JWT from Authorization header
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader) {
      return createResponse(401, { error: 'Missing Authorization header' });
    }

    const tokenMatch = authHeader.match(/^Bearer (.+)$/);
    if (!tokenMatch) {
      return createResponse(401, { error: 'Invalid Authorization header format' });
    }

    const sessionJWT = tokenMatch[1];

    // Verify JWT and check admin role
    let decoded: any;
    try {
      const secret = await getJWTSecret();
      decoded = jwt.verify(sessionJWT, secret) as any;
    } catch (error) {
      return createResponse(401, { error: 'Invalid or expired token' });
    }

    // Check if user is admin
    if (decoded.role !== 'admin') {
      return createResponse(403, { error: 'Admin access required' });
    }

    // Route to appropriate handler
    if (path === '/v1/admin/users' && method === 'GET') {
      return await handleListUsers(queryParams, decoded);
    } else if (path.match(/^\/v1\/admin\/users\/([^/]+)$/) && method === 'GET') {
      const userId = path.match(/^\/v1\/admin\/users\/([^/]+)$/)?.[1];
      return await handleGetUser(userId!, decoded);
    } else if (path.match(/^\/v1\/admin\/users\/([^/]+)$/) && method === 'PUT') {
      const userId = path.match(/^\/v1\/admin\/users\/([^/]+)$/)?.[1];
      return await handleUpdateUser(userId!, body, decoded);
    } else if (path.match(/^\/v1\/admin\/users\/([^/]+)$/) && method === 'DELETE') {
      const userId = path.match(/^\/v1\/admin\/users\/([^/]+)$/)?.[1];
      return await handleDeactivateUser(userId!, decoded);
    } else if (path === '/v1/admin/whitelist' && method === 'GET') {
      return await handleListWhitelist(decoded);
    } else if (path === '/v1/admin/whitelist' && method === 'POST') {
      return await handleAddWhitelistUser(body, decoded);
    } else if (path.match(/^\/v1\/admin\/whitelist\/([^/]+)$/) && method === 'DELETE') {
      const email = decodeURIComponent(path.match(/^\/v1\/admin\/whitelist\/([^/]+)$/)?.[1] || '');
      return await handleDeleteWhitelistUser(email, decoded);
    } else if (path === '/v1/admin/activity' && method === 'GET') {
      return await handleGetActivityLogs(queryParams, decoded);
    } else if (path === '/v1/admin/activity/log' && method === 'POST') {
      return await handleLogActivity(body, decoded, event);
    } else {
      return createResponse(404, { error: 'Not found' });
    }
  } catch (error) {
    console.error('Admin Lambda error:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * List users with pagination, filtering, and sorting
 */
async function handleListUsers(params: any, adminUser: any) {
  const page = parseInt(params.page || '1', 10);
  const limit = parseInt(params.limit || '20', 10);
  const emailFilter = params.emailFilter || '';
  const sortBy = params.sortBy || 'createdAt';
  const showDeactivated = params.showDeactivated === 'true' || params.showDeactivated === true;

  const offset = (page - 1) * limit;

  try {
    // Scan all users (for small datasets, this is fine)
    // In production, consider using pagination tokens
    const scanResult = await docClient.send(new ScanCommand({
      TableName: USERS_TABLE,
    }));

    let users = scanResult.Items || [];

    // Filter out deactivated users unless explicitly requested
    if (!showDeactivated) {
      users = users.filter((u: any) => !u.isDeactivated);
    }

    // Filter by email if provided
    if (emailFilter) {
      const filterLower = emailFilter.toLowerCase();
      users = users.filter((u: any) => 
        u.email?.toLowerCase().includes(filterLower)
      );
    }

    // Sort users
    users.sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      
      switch (sortBy) {
        case 'email':
          aVal = a.email || '';
          bVal = b.email || '';
          return aVal.localeCompare(bVal);
        case 'lastActiveAt':
          aVal = a.lastActiveAt || 0;
          bVal = b.lastActiveAt || 0;
          return bVal - aVal; // Most recent first
        case 'createdAt':
        default:
          aVal = a.createdAt || 0;
          bVal = b.createdAt || 0;
          return bVal - aVal; // Most recent first
      }
    });

    // Paginate
    const total = users.length;
    const paginatedUsers = users.slice(offset, offset + limit);

    // Format response
    const formattedUsers = paginatedUsers.map((u: any) => ({
      userId: u.userId,
      email: u.email,
      role: u.role || 'basic',
      createdAt: u.createdAt,
      lastActiveAt: u.lastActiveAt,
      registrationMethod: u.registrationMethod || 'email',
      isDeactivated: u.isDeactivated || false,
      expirationDate: u.expirationDate,
    }));

    return createResponse(200, {
      users: formattedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing users:', error);
    return createResponse(500, { error: 'Failed to list users' });
  }
}

/**
 * Get user details
 */
async function handleGetUser(userId: string, adminUser: any) {
  try {
    // Fetch user directly from DynamoDB to get all fields
    const result = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    }));

    if (!result.Item) {
      return createResponse(404, { error: 'User not found' });
    }

    const user = result.Item as any;

    return createResponse(200, {
      userId: user.userId,
      email: user.email,
      role: user.role || 'basic',
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt,
      registrationMethod: user.registrationMethod || 'email',
      isDeactivated: user.isDeactivated || false,
      deactivatedAt: user.deactivatedAt,
      expirationDate: user.expirationDate,
    });
  } catch (error) {
    console.error('Error getting user:', error);
    return createResponse(500, { error: 'Failed to get user' });
  }
}

/**
 * Update user (role, expiration, reactivate)
 */
async function handleUpdateUser(userId: string, body: any, adminUser: any) {
  try {
    const user = await getUserProfile(userId);
    
    if (!user) {
      return createResponse(404, { error: 'User not found' });
    }

    const now = Math.floor(Date.now() / 1000);
    const updates: any = {
      updatedAt: now,
    };

    // Update role if provided
    if (body.role !== undefined) {
      const validatedRole = validateRole(body.role);
      if (!validatedRole) {
        return createResponse(400, { error: 'Invalid role. Must be "basic" or "admin"' });
      }
      updates.role = validatedRole;
    }

    // Update expiration date if provided
    if (body.expirationDate !== undefined) {
      if (body.expirationDate === null || body.expirationDate === '') {
        // Remove expiration
        updates.expirationDate = undefined;
      } else {
        updates.expirationDate = parseInt(body.expirationDate, 10);
      }
    }

    // Reactivate if requested
    if (body.reactivate === true && user.isDeactivated) {
      updates.isDeactivated = false;
      updates.deactivatedAt = undefined;
    }

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: any = {};
    const expressionAttributeValues: any = {};

    updateExpressions.push('#updatedAt = :now');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':now'] = now;

    if (updates.role !== undefined) {
      updateExpressions.push('#role = :role');
      expressionAttributeNames['#role'] = 'role';
      expressionAttributeValues[':role'] = updates.role;
    }

    if (updates.expirationDate !== undefined) {
      if (updates.expirationDate === undefined) {
        // Remove expiration
        updateExpressions.push('REMOVE expirationDate');
      } else {
        updateExpressions.push('expirationDate = :expirationDate');
        expressionAttributeValues[':expirationDate'] = updates.expirationDate;
      }
    }

    if (updates.isDeactivated !== undefined) {
      updateExpressions.push('isDeactivated = :isDeactivated');
      expressionAttributeValues[':isDeactivated'] = updates.isDeactivated;
      
      if (updates.deactivatedAt !== undefined) {
        updateExpressions.push('REMOVE deactivatedAt');
      }
    }

    await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
    }));

    // Log activity
    await logActivity('user_updated', adminUser.userId, adminUser.email, {
      targetUserId: userId,
      targetEmail: user.email,
      updates,
    });

    return createResponse(200, {
      success: true,
      message: 'User updated successfully',
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return createResponse(500, { error: 'Failed to update user' });
  }
}

/**
 * Deactivate user (soft delete)
 */
async function handleDeactivateUser(userId: string, adminUser: any) {
  try {
    const user = await getUserProfile(userId);
    
    if (!user) {
      return createResponse(404, { error: 'User not found' });
    }

    if (user.isDeactivated) {
      return createResponse(400, { error: 'User is already deactivated' });
    }

    const now = Math.floor(Date.now() / 1000);

    // Mark user as deactivated
    await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: 'SET isDeactivated = :true, deactivatedAt = :now, updatedAt = :now',
      ExpressionAttributeValues: {
        ':true': true,
        ':now': now,
      },
    }));

    // Delete all user sessions
    try {
      const sessionsResult = await docClient.send(new QueryCommand({
        TableName: TOKENS_TABLE,
        IndexName: 'userId-tokenType-index',
        KeyConditionExpression: 'userId = :userId AND tokenType = :tokenType',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':tokenType': 'session',
        },
      }));

      if (sessionsResult.Items) {
        for (const session of sessionsResult.Items) {
          await docClient.send(new DeleteCommand({
            TableName: TOKENS_TABLE,
            Key: { tokenId: session.tokenId },
          }));
        }
      }
    } catch (error) {
      console.error('Error deleting user sessions:', error);
      // Continue even if session deletion fails
    }

    // Log activity
    await logActivity('user_deactivated', adminUser.userId, adminUser.email, {
      targetUserId: userId,
      targetEmail: user.email,
    });

    return createResponse(200, {
      success: true,
      message: 'User deactivated successfully',
    });
  } catch (error) {
    console.error('Error deactivating user:', error);
    return createResponse(500, { error: 'Failed to deactivate user' });
  }
}

/**
 * List whitelist users
 */
async function handleListWhitelist(adminUser: any) {
  try {
    const scanResult = await docClient.send(new ScanCommand({
      TableName: APPROVED_EMAILS_TABLE,
    }));

    const whitelistUsers = (scanResult.Items || []).map((item: any) => {
      // Check if user has registered
      const hasRegistered = !!item.registeredAt;

      return {
        email: item.email,
        role: item.role || 'basic',
        expirationDate: item.expirationDate,
        registeredAt: item.registeredAt,
        hasRegistered,
        approvedAt: item.approvedAt,
      };
    });

    return createResponse(200, {
      whitelistUsers,
    });
  } catch (error) {
    console.error('Error listing whitelist:', error);
    return createResponse(500, { error: 'Failed to list whitelist users' });
  }
}

/**
 * Add whitelist user
 */
async function handleAddWhitelistUser(body: any, adminUser: any) {
  const { email, role, expirationDate, noExpiration } = body;

  if (!email || !isValidEmail(email)) {
    return createResponse(400, { error: 'Valid email is required' });
  }

  const emailLower = email.toLowerCase();

  // Auto-approved emails don't need whitelist entry
  if (emailLower.endsWith('@sigmacomputing.com')) {
    return createResponse(400, { error: 'Sigma emails are automatically approved and do not need whitelist entry' });
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const validatedRole = validateRole(role) || 'basic';

    const whitelistItem: any = {
      email: emailLower,
      role: validatedRole,
      approvedBy: adminUser.email,
      approvedAt: now,
    };

    // Set expiration date (default to 2 weeks if not specified and noExpiration is false)
    if (noExpiration) {
      // No expiration
    } else if (expirationDate) {
      whitelistItem.expirationDate = parseInt(expirationDate, 10);
    } else {
      // Default to 2 weeks from now
      whitelistItem.expirationDate = now + (14 * 24 * 60 * 60);
    }

    // Update if exists, otherwise create
    await docClient.send(new PutCommand({
      TableName: APPROVED_EMAILS_TABLE,
      Item: whitelistItem,
    }));

    // Log activity
    await logActivity('whitelist_user_added', adminUser.userId, adminUser.email, {
      targetEmail: emailLower,
      role: validatedRole,
      expirationDate: whitelistItem.expirationDate,
    });

    return createResponse(200, {
      success: true,
      message: 'Whitelist user added successfully',
    });
  } catch (error) {
    console.error('Error adding whitelist user:', error);
    return createResponse(500, { error: 'Failed to add whitelist user' });
  }
}

/**
 * Delete whitelist user
 */
async function handleDeleteWhitelistUser(email: string, adminUser: any) {
  const emailLower = email.toLowerCase();

  try {
    // Check if user has registered
    const user = await getUserProfileByEmail(emailLower);

    // Remove from whitelist
    await docClient.send(new DeleteCommand({
      TableName: APPROVED_EMAILS_TABLE,
      Key: { email: emailLower },
    }));

    // If user exists, deactivate them
    if (user) {
      const now = Math.floor(Date.now() / 1000);
      await docClient.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { userId: user.userId },
        UpdateExpression: 'SET isDeactivated = :true, deactivatedAt = :now, updatedAt = :now',
        ExpressionAttributeValues: {
          ':true': true,
          ':now': now,
        },
      }));

      // Delete user sessions
      try {
        const sessionsResult = await docClient.send(new QueryCommand({
          TableName: TOKENS_TABLE,
          IndexName: 'userId-tokenType-index',
          KeyConditionExpression: 'userId = :userId AND tokenType = :tokenType',
          ExpressionAttributeValues: {
            ':userId': user.userId,
            ':tokenType': 'session',
          },
        }));

        if (sessionsResult.Items) {
          for (const session of sessionsResult.Items) {
            await docClient.send(new DeleteCommand({
              TableName: TOKENS_TABLE,
              Key: { tokenId: session.tokenId },
            }));
          }
        }
      } catch (error) {
        console.error('Error deleting user sessions:', error);
      }
    }

    // Log activity
    await logActivity('whitelist_user_deleted', adminUser.userId, adminUser.email, {
      targetEmail: emailLower,
      userWasRegistered: !!user,
    });

    return createResponse(200, {
      success: true,
      message: 'Whitelist user deleted successfully',
      userWasDeactivated: !!user,
    });
  } catch (error) {
    console.error('Error deleting whitelist user:', error);
    return createResponse(500, { error: 'Failed to delete whitelist user' });
  }
}

/**
 * Log activity from mobile app
 */
async function handleLogActivity(body: any, adminUser: any, event: any) {
  const { eventType, metadata, deviceId } = body;

  if (!eventType) {
    return createResponse(400, { error: 'eventType is required' });
  }

  try {
    const ipAddress = event.requestContext?.identity?.sourceIp || 
                     event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
                     event.headers?.['X-Forwarded-For']?.split(',')[0]?.trim();

    await logActivity(
      eventType,
      adminUser.userId,
      adminUser.email,
      metadata || {},
      deviceId,
      ipAddress
    );

    return createResponse(200, {
      success: true,
      message: 'Activity logged successfully',
    });
  } catch (error) {
    console.error('Error logging activity:', error);
    return createResponse(500, { error: 'Failed to log activity' });
  }
}

/**
 * Get activity logs with pagination and filtering
 */
async function handleGetActivityLogs(params: any, adminUser: any) {
  const page = parseInt(params.page || '1', 10);
  const limit = parseInt(params.limit || '50', 10);
  const emailFilter = params.emailFilter || '';

  const offset = (page - 1) * limit;

  try {
    // Scan all activities (for small datasets)
    // In production, consider using pagination tokens or GSI
    const scanResult = await docClient.send(new ScanCommand({
      TableName: ACTIVITY_TABLE,
    }));

    let activities = scanResult.Items || [];

    // Filter by email if provided
    if (emailFilter) {
      const filterLower = emailFilter.toLowerCase();
      activities = activities.filter((a: any) => 
        a.email?.toLowerCase().includes(filterLower)
      );
    }

    // Sort by timestamp (most recent first)
    activities.sort((a: any, b: any) => {
      const aVal = a.timestamp || 0;
      const bVal = b.timestamp || 0;
      return bVal - aVal;
    });

    // Paginate
    const total = activities.length;
    const paginatedActivities = activities.slice(offset, offset + limit);

    return createResponse(200, {
      activities: paginatedActivities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error getting activity logs:', error);
    return createResponse(500, { error: 'Failed to get activity logs' });
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

  const secret = result.SecretString;
  if (!secret) {
    throw new Error('JWT secret is empty');
  }
  
  jwtSecret = secret;
  return secret;
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
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
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

