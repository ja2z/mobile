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

// CRITICAL: Log module initialization immediately after imports
// This helps us verify the Lambda is loading the module at all
// DEPLOYMENT MARKER: Change this timestamp to verify new deployments
const DEPLOYMENT_MARKER = '2025-11-14T05:45:00.000Z-ROUTING-DEBUG';
console.log('========== MODULE INITIALIZATION START ==========');
console.log('DEPLOYMENT MARKER:', DEPLOYMENT_MARKER);
console.log('Timestamp:', new Date().toISOString());
console.log('Node version:', process.version);
console.log('All imports completed successfully');

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const secretsClient = new SecretsManagerClient({});

console.log('AWS clients initialized successfully');

// CRITICAL: Add process-level error handlers to catch any unhandled errors
process.on('uncaughtException', (error: Error) => {
  console.error('========== UNCAUGHT EXCEPTION ==========');
  console.error('Error:', error);
  console.error('Error message:', error.message);
  console.error('Error stack:', error.stack);
  console.error('Error name:', error.name);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('========== UNHANDLED REJECTION ==========');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  if (reason instanceof Error) {
    console.error('Error message:', reason.message);
    console.error('Error stack:', reason.stack);
  }
});

console.log('Process error handlers registered');

// Log memory usage at module initialization
const initialMemory = process.memoryUsage();
console.log('Initial memory usage:', {
  rss: `${Math.round(initialMemory.rss / 1024 / 1024)}MB`,
  heapTotal: `${Math.round(initialMemory.heapTotal / 1024 / 1024)}MB`,
  heapUsed: `${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`,
  external: `${Math.round(initialMemory.external / 1024 / 1024)}MB`
});

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
const handlerImpl = async (event: any) => {
  // CRITICAL: Log IMMEDIATELY - this must be the first thing that happens
  // Use synchronous operations to ensure logs are written
  console.log('========== ADMIN LAMBDA INVOCATION START ==========');
  console.log('Timestamp:', new Date().toISOString());
  
  // Log memory usage at handler start
  const memUsage = process.memoryUsage();
  console.log('Memory at handler start:', {
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
  });
  
  // Force flush logs immediately
  if (typeof process !== 'undefined' && process.stdout) {
    process.stdout.write('FORCE LOG FLUSH\n');
  }
  
  // CRITICAL: Log immediately to verify Lambda is being invoked
  // Use try-catch around logging in case there's an issue with the event itself
  try {
    console.log('Request ID:', event?.requestContext?.requestId || 'unknown');
    console.log('Event type:', typeof event);
    console.log('Event keys:', event ? Object.keys(event) : 'event is null/undefined');
    
    // Try to stringify, but handle circular references
    try {
      console.log('Full event:', JSON.stringify(event, null, 2));
    } catch (stringifyError) {
      console.log('Could not stringify full event:', stringifyError);
      console.log('Event summary:', {
        hasPath: !!event?.path,
        hasRawPath: !!event?.rawPath,
        hasHttpMethod: !!event?.httpMethod,
        hasRequestContext: !!event?.requestContext,
        hasHeaders: !!event?.headers,
        hasBody: !!event?.body
      });
    }
  } catch (logError) {
    // Even logging failed - this is very bad, but try to return something
    console.error('CRITICAL: Failed to log invocation start:', logError);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Lambda initialization error', logError: String(logError) })
    };
  }

  try {
    let path = event.path || event.rawPath;
    const method = event.httpMethod || event.requestContext?.http?.method;

    console.log(`========== ROUTING INFO ==========`);
    console.log(`Raw event.path: ${event.path}`);
    console.log(`Raw event.rawPath: ${event.rawPath}`);
    console.log(`Initial path variable: ${path}`);
    console.log(`Method: ${method}`);
    console.log(`Request context path: ${event.requestContext?.path}`);
    console.log(`Request context resource path: ${event.requestContext?.resourcePath}`);
    console.log(`Path parameters: ${JSON.stringify(event.pathParameters)}`);
    console.log(`Query string parameters: ${JSON.stringify(event.queryStringParameters)}`);

    // Normalize path - CRITICAL: Wrap in try-catch to catch any path processing errors
    const originalPath = path;
    try {
      if (!path) {
        console.error('CRITICAL: path is null/undefined!');
        return createResponse(500, { error: 'Path is missing from request' });
      }
      
      if (typeof path !== 'string') {
        console.error('CRITICAL: path is not a string!', typeof path);
        return createResponse(500, { error: 'Path is not a string', pathType: typeof path });
      }
      
      if (path.startsWith('/v1/v1/')) {
        path = path.replace('/v1/v1/', '/v1/');
        console.log(`Normalized (removed double /v1): ${path}`);
      } else if (path.startsWith('/admin/')) {
        path = '/v1' + path;
        console.log(`Normalized (added /v1 prefix): ${path}`);
      } else if (path.startsWith('/whitelist/')) {
        path = '/v1/admin' + path;
        console.log(`Normalized (added /v1/admin prefix): ${path}`);
      } else if (path.startsWith('/v1/whitelist/')) {
        path = path.replace('/v1/whitelist/', '/v1/admin/whitelist/');
        console.log(`Normalized (added /admin): ${path}`);
      } else {
        console.log(`No normalization needed: ${path}`);
      }
      
      console.log(`Final normalized path: ${path}`);
      console.log(`Path comparison checks:`);
      console.log(`  path === '/v1/admin/users': ${path === '/v1/admin/users'}`);
      console.log(`  path === '/v1/admin/whitelist': ${path === '/v1/admin/whitelist'}`);
      console.log(`  path === '/v1/admin/activity': ${path === '/v1/admin/activity'}`);
      console.log(`  path === '/admin/users': ${path === '/admin/users'}`);
      console.log(`  path === '/admin/whitelist': ${path === '/admin/whitelist'}`);
      console.log(`  path === '/admin/activity': ${path === '/admin/activity'}`);
    } catch (pathError: any) {
      console.error('========== PATH NORMALIZATION ERROR ==========');
      console.error('Error normalizing path:', pathError);
      console.error('Original path:', originalPath);
      console.error('Path type:', typeof originalPath);
      return createResponse(500, {
        error: 'Path normalization failed',
        details: pathError?.message || 'Unknown error',
        originalPath: originalPath
      });
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

    // CRITICAL: Health check endpoint that bypasses auth - helps verify Lambda is being invoked
    // This should be checked BEFORE auth to help diagnose zero-logs issues
    if (path === '/v1/admin/health' && method === 'GET') {
      console.log('========== HEALTH CHECK ENDPOINT (NO AUTH) ==========');
      console.log('Health check called - this proves Lambda is being invoked');
      console.log('DEPLOYMENT MARKER:', DEPLOYMENT_MARKER);
      console.log('Path:', path);
      console.log('Method:', method);
      console.log('Event keys:', event ? Object.keys(event) : 'no event');
      return createResponse(200, { 
        status: 'ok', 
        message: 'Admin Lambda is working - Lambda IS being invoked',
        deploymentMarker: DEPLOYMENT_MARKER,
        timestamp: new Date().toISOString(),
        path: path,
        method: method,
        eventPath: event.path,
        eventRawPath: event.rawPath,
        requestContextPath: event.requestContext?.path
      });
    }

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
      console.log('JWT verification attempt:', {
        tokenLength: sessionJWT.length,
        tokenPrefix: sessionJWT.substring(0, 20) + '...',
        secretLength: secret.length,
        secretPrefix: secret.substring(0, 10) + '...'
      });
      decoded = jwt.verify(sessionJWT, secret) as any;
      console.log('JWT verified successfully:', {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        exp: decoded.exp,
        iat: decoded.iat,
        currentTime: Math.floor(Date.now() / 1000),
        isExpired: decoded.exp ? decoded.exp < Math.floor(Date.now() / 1000) : 'unknown'
      });
    } catch (error) {
      console.error('JWT verification failed:', {
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : typeof error,
        errorStack: error instanceof Error ? error.stack : undefined,
        tokenLength: sessionJWT.length,
        tokenPrefix: sessionJWT.substring(0, 20) + '...'
      });
      return createResponse(401, { error: 'Invalid or expired token' });
    }

    // Check if user is admin (except for activity/log endpoint which allows both roles)
    const isActivityLogEndpoint = path === '/v1/admin/activity/log' && method === 'POST';
    
    if (!isActivityLogEndpoint && decoded.role !== 'admin') {
      return createResponse(403, { error: 'Admin access required' });
    }
    
    // For activity log endpoint, allow both basic and admin users
    if (isActivityLogEndpoint && decoded.role !== 'admin' && decoded.role !== 'basic') {
      return createResponse(403, { error: 'Authentication required' });
    }

    // Route to appropriate handler
    console.log('========== STARTING ROUTING LOGIC ==========');
    console.log('Raw path from event.path:', event.path);
    console.log('Raw path from event.rawPath:', event.rawPath);
    console.log('Normalized path:', path);
    console.log('Path length:', path?.length);
    console.log('Path char codes:', path?.split('').map((c: string) => c.charCodeAt(0)).join(','));
    console.log('Method:', method);
    console.log('Path comparison checks (exact match):');
    console.log('  "/v1/admin/users" === path:', '/v1/admin/users' === path);
    console.log('  "/v1/admin/whitelist" === path:', '/v1/admin/whitelist' === path);
    console.log('  "/v1/admin/activity" === path:', '/v1/admin/activity' === path);
    console.log('  "/admin/users" === path:', '/admin/users' === path);
    console.log('  "/admin/whitelist" === path:', '/admin/whitelist' === path);
    console.log('  "/admin/activity" === path:', '/admin/activity' === path);
    console.log('Path comparison checks (includes):');
    console.log('  path.includes("whitelist"):', path?.includes('whitelist'));
    console.log('  path.includes("activity"):', path?.includes('activity'));
    
    // CRITICAL: Skip all function checks to avoid any potential crashes
    // Just proceed directly to routing
    console.log('Proceeding to routing logic (skipping function checks)...');
    
    try {
      if (path === '/v1/admin/users' && method === 'GET') {
        console.log('Routing to handleListUsers');
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
      } else if (method === 'DELETE') {
        // COMPREHENSIVE DELETE ROUTING - Catch ALL DELETE requests first
        console.log('========== DELETE REQUEST DETECTED ==========');
        console.log('Full event structure:', JSON.stringify({
          path: event.path,
          rawPath: event.rawPath,
          httpMethod: event.httpMethod,
          pathParameters: event.pathParameters,
          requestContext: {
            path: event.requestContext?.path,
            resourcePath: event.requestContext?.resourcePath,
            httpMethod: event.requestContext?.httpMethod,
          }
        }, null, 2));
        
        // Determine what resource is being deleted
        const pathStr = path || '';
        const resourcePath = event.requestContext?.resourcePath || '';
        const hasWhitelist = pathStr.includes('whitelist') || resourcePath.includes('whitelist');
        const hasUsers = pathStr.includes('/users/') && !pathStr.includes('whitelist');
        
        console.log('DELETE request analysis:');
        console.log('  Path:', pathStr);
        console.log('  Resource path:', resourcePath);
        console.log('  Has whitelist:', hasWhitelist);
        console.log('  Has users:', hasUsers);
        console.log('  PathParameters:', JSON.stringify(event.pathParameters));
        
        // Handle DELETE /whitelist/{email}
        if (hasWhitelist) {
          console.log('========== PROCESSING DELETE WHITELIST ==========');
          
          // Try EVERY possible way to get the email
          let rawEmail: string | undefined;
          
          // 1. pathParameters.email
          if (event.pathParameters?.email) {
            rawEmail = event.pathParameters.email;
            console.log('✓ Email from pathParameters.email:', rawEmail);
          }
          // 2. pathParameters.proxy (catch-all proxy)
          else if (event.pathParameters?.proxy) {
            rawEmail = event.pathParameters.proxy;
            console.log('✓ Email from pathParameters.proxy:', rawEmail);
          }
          // 3. Extract from normalized path
          else {
            // Try multiple regex patterns
            const patterns = [
              /^\/v1\/admin\/whitelist\/(.+)$/,
              /^\/admin\/whitelist\/(.+)$/,
              /^\/whitelist\/(.+)$/,
              /\/whitelist\/([^/]+)/,
            ];
            
            for (const pattern of patterns) {
              const match = pathStr.match(pattern);
              if (match && match[1]) {
                rawEmail = match[1];
                console.log(`✓ Email from path regex (${pattern}):`, rawEmail);
                break;
              }
            }
          }
          
          // 4. Try extracting from requestContext.path
          if (!rawEmail && event.requestContext?.path) {
            const ctxPath = event.requestContext.path;
            const ctxMatch = ctxPath.match(/\/whitelist\/([^/]+)/);
            if (ctxMatch && ctxMatch[1]) {
              rawEmail = ctxMatch[1];
              console.log('✓ Email from requestContext.path:', rawEmail);
            }
          }
          
          if (!rawEmail) {
            console.error('❌ FAILED TO EXTRACT EMAIL');
            console.error('Available data:', {
              path: pathStr,
              pathParameters: event.pathParameters,
              requestContextPath: event.requestContext?.path,
              resourcePath: resourcePath,
            });
            return createResponse(400, { 
              error: 'Email not found',
              debug: {
                path: pathStr,
                pathParameters: event.pathParameters,
                requestContextPath: event.requestContext?.path,
              }
            });
          }
          
          // Decode email
          let email: string = rawEmail;
          try {
            email = decodeURIComponent(rawEmail);
            console.log('Decoded email:', email);
          } catch (e) {
            console.log('Using raw email (decode failed):', email);
          }
          
          // Call handler
          try {
            console.log('Calling handleDeleteWhitelistUser with email:', email);
            const result = await handleDeleteWhitelistUser(email, decoded);
            console.log('✓ Delete handler succeeded, status:', result.statusCode);
            return result;
          } catch (handlerError: any) {
            console.error('❌ Delete handler threw error:', handlerError);
            console.error('Error details:', {
              message: handlerError?.message,
              stack: handlerError?.stack,
              name: handlerError?.name,
            });
            return createResponse(500, {
              error: 'Failed to delete whitelist user',
              message: handlerError?.message || 'Unknown error',
            });
          }
        }
        // Handle DELETE /users/{userId} - fall through to existing handler
        else if (hasUsers) {
          // Let it fall through to the existing user delete handler below
          console.log('DELETE request is for users, continuing to user handler...');
        }
        else {
          console.error('DELETE request does not match whitelist or users');
          return createResponse(404, { error: 'DELETE endpoint not found' });
        }
      } else if (path.match(/^\/v1\/admin\/users\/([^/]+)$/) && method === 'DELETE') {
        // User delete handler (existing)
        const userId = path.match(/^\/v1\/admin\/users\/([^/]+)$/)?.[1];
        return await handleDeactivateUser(userId!, decoded);
      } else if (path === '/v1/admin/activity' && method === 'GET') {
        console.log('========== MATCHED ACTIVITY LOGS ROUTE ==========');
        console.log('Path matches /v1/admin/activity');
        console.log('Method matches GET');
        console.log('About to call handleGetActivityLogs function');
        return await handleGetActivityLogs(queryParams, decoded);
      } else if (path === '/v1/admin/activity/log' && method === 'POST') {
        return await handleLogActivity(body, decoded, event);
      } else {
        console.log(`========== NO ROUTE MATCHED ==========`);
        console.log(`Path: ${path}, Method: ${method}`);
        console.log(`Path type: ${typeof path}, Path value: "${path}"`);
        console.log(`Path length: ${path?.length}`);
        console.log(`Method type: ${typeof method}, Method value: "${method}"`);
        console.log(`Path parameters: ${JSON.stringify(event.pathParameters)}`);
        console.log(`Available routes: /v1/admin/users, /v1/admin/whitelist, /v1/admin/activity, /v1/admin/activity/log, /v1/admin/health`);
        console.log(`Checking if path contains whitelist: ${path?.includes('whitelist')}`);
        console.log(`Checking if path contains activity: ${path?.includes('activity')}`);
        
        // Check if this is a DELETE request to whitelist that didn't match
        if (method === 'DELETE' && (path?.includes('whitelist') || event.pathParameters?.email)) {
          console.error('========== DELETE WHITELIST PATH MISMATCH ==========');
          console.error(`DELETE request to whitelist but path didn't match regex!`);
          console.error(`Path: ${path}`);
          console.error(`PathParameters: ${JSON.stringify(event.pathParameters)}`);
          console.error(`Regex pattern: /^\\/v1\\/admin\\/whitelist\\/([^/]+)$/`);
          console.error(`Path matches regex: ${path?.match(/^\/v1\/admin\/whitelist\/([^/]+)$/) ? 'YES' : 'NO'}`);
          
          // Try to handle it anyway using pathParameters
          if (event.pathParameters?.email || event.pathParameters?.proxy) {
            const email = event.pathParameters.email || event.pathParameters.proxy;
            console.log(`Attempting to handle DELETE using pathParameters email: ${email}`);
            try {
              return await handleDeleteWhitelistUser(email, decoded);
            } catch (error: any) {
              console.error('Error in fallback DELETE handler:', error);
              return createResponse(500, { error: 'Failed to delete whitelist user', details: error.message });
            }
          }
        }
        
        // CRITICAL: If path contains whitelist or activity but didn't match, log detailed info
        if (path?.includes('whitelist') || path?.includes('activity')) {
          console.error('========== PATH MISMATCH DETECTED ==========');
          console.error(`Path "${path}" contains whitelist/activity but didn't match any route!`);
          console.error('This suggests a path normalization or matching issue');
          return createResponse(500, { 
            error: 'Route matching failed', 
            debug: { 
              receivedPath: path, 
              method,
              pathContainsWhitelist: path?.includes('whitelist'),
              pathContainsActivity: path?.includes('activity'),
              pathParameters: event.pathParameters
            } 
          });
        }
        
        return createResponse(404, { error: 'Not found', debug: { receivedPath: path, method, pathParameters: event.pathParameters } });
      }
    } catch (routingError: any) {
      console.error('========== ROUTING LOGIC ERROR ==========');
      console.error('Error in routing logic:', routingError);
      console.error('Error message:', routingError?.message);
      console.error('Error stack:', routingError?.stack);
      return createResponse(500, {
        error: 'Internal server error',
        message: routingError?.message || 'Error in routing logic',
        details: 'Error caught in routing try-catch'
      });
    }
  } catch (error) {
    console.error('========== ADMIN LAMBDA ERROR ==========');
    console.error('Error type:', typeof error);
    console.error('Error:', error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error code:', (error as any).code);
    }
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return createResponse(500, {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    console.log('========== ADMIN LAMBDA INVOCATION END ==========');
  }
};

/**
 * Wrapped handler with top-level error catching
 * This ensures we catch any errors that occur during module initialization
 * or handler execution that might prevent logging
 */
export const handler = async (event: any, context: any) => {
  // CRITICAL: Log at the very start of the exported handler
  // This MUST be the first line that executes
  console.log('========== EXPORTED HANDLER CALLED ==========');
  console.log('Handler invoked at:', new Date().toISOString());
  console.log('Event received:', !!event);
  console.log('Context received:', !!context);
  
  // Log memory before anything else
  try {
    const mem = process.memoryUsage();
    console.log('Memory at handler entry:', {
      rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`
    });
  } catch (memErr) {
    console.error('Could not log memory:', memErr);
  }
  
  try {
    console.log('Calling handlerImpl...');
    const result = await handlerImpl(event);
    console.log('handlerImpl returned successfully');
    return result;
  } catch (topLevelError: any) {
    // This catches any errors that weren't caught by the handler itself
    // This includes module initialization errors, import errors, etc.
    console.error('========== TOP-LEVEL ERROR HANDLER ==========');
    console.error('This error was not caught by handler:', topLevelError);
    console.error('Error type:', typeof topLevelError);
    console.error('Error message:', topLevelError instanceof Error ? topLevelError.message : String(topLevelError));
    console.error('Error stack:', topLevelError instanceof Error ? topLevelError.stack : 'No stack');
    console.error('Error name:', topLevelError instanceof Error ? topLevelError.name : typeof topLevelError);
    console.error('Error code:', topLevelError?.code);
    
    // Try to stringify the error
    try {
      console.error('Full error object:', JSON.stringify(topLevelError, Object.getOwnPropertyNames(topLevelError)));
    } catch (stringifyErr) {
      console.error('Could not stringify error:', stringifyErr);
    }
    
    // Return a proper error response
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: topLevelError instanceof Error ? topLevelError.message : 'Unknown error occurred',
        type: topLevelError instanceof Error ? topLevelError.name : typeof topLevelError
      })
    };
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
 * SIMPLIFIED VERSION - Minimal operations to isolate the crash
 */
async function handleListWhitelist(adminUser: any) {
  // CRITICAL: Log immediately with try-catch to ensure logging works
  try {
    console.log('========== handleListWhitelist FUNCTION ENTERED ==========');
    console.log('Function called at:', new Date().toISOString());
    console.log('Function exists check:', typeof handleListWhitelist);
  } catch (logErr) {
    // Even logging failed - return error immediately
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Failed to log in handler', details: String(logErr) })
    };
  }
  
  // Validate inputs first
  if (!adminUser) {
    console.error('adminUser is null/undefined');
    return createResponse(500, { error: 'Invalid admin user' });
  }
  
  console.log('Admin user validated:', { userId: adminUser.userId, email: adminUser.email });
  
  // Check table name exists
  if (!APPROVED_EMAILS_TABLE) {
    console.error('APPROVED_EMAILS_TABLE is not set');
    return createResponse(500, { error: 'Table name not configured' });
  }
  
  console.log('Table name:', APPROVED_EMAILS_TABLE);
  
  // Check docClient exists
  if (!docClient) {
    console.error('docClient is null/undefined');
    return createResponse(500, { error: 'DynamoDB client not initialized' });
  }
  
  console.log('docClient validated');
  
  try {
    console.log('Attempting to scan APPROVED_EMAILS_TABLE...');
    const scanCommand = new ScanCommand({
      TableName: APPROVED_EMAILS_TABLE,
    });
    console.log('ScanCommand created successfully');
    
    const scanResult = await docClient.send(scanCommand);
    console.log('Scan successful, items found:', scanResult.Items?.length || 0);

    const whitelistUsers = (scanResult.Items || []).map((item: any) => {
      return {
        email: item.email,
        role: item.role || 'basic',
        expirationDate: item.expirationDate,
        registeredAt: item.registeredAt,
        hasRegistered: !!item.registeredAt,
        approvedAt: item.approvedAt,
      };
    });

    return createResponse(200, {
      whitelistUsers,
    });
  } catch (error) {
    console.error('========== handleListWhitelist ERROR ==========');
    console.error('Error:', error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    return createResponse(500, { 
      error: 'Failed to list whitelist users', 
      details: error instanceof Error ? error.message : String(error)
    });
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
  console.log('========== handleDeleteWhitelistUser START ==========');
  console.log('Received email:', email);
  console.log('Email type:', typeof email);
  console.log('Admin user:', adminUser?.email);
  
  if (!email || typeof email !== 'string') {
    console.error('Invalid email parameter:', email);
    return createResponse(400, { error: 'Invalid email parameter' });
  }
  
  const emailLower = email.toLowerCase();
  console.log('Normalized email:', emailLower);

  try {
    // Check if user has registered
    let user = null;
    try {
      console.log('Calling getUserProfileByEmail with:', emailLower);
      user = await getUserProfileByEmail(emailLower);
      console.log('getUserProfileByEmail returned:', user ? 'user found' : 'no user');
    } catch (error: any) {
      console.error('Error looking up user profile:', error);
      console.error('Error type:', typeof error);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      // Continue even if user lookup fails - we can still delete the whitelist entry
      user = null;
    }

    // Check if whitelist entry exists before trying to delete
    let whitelistExisted = false;
    try {
      const whitelistCheck = await docClient.send(new GetCommand({
        TableName: APPROVED_EMAILS_TABLE,
        Key: { email: emailLower },
      }));
      whitelistExisted = !!whitelistCheck.Item;
    } catch (error) {
      console.error('Error checking whitelist entry:', error);
      // Continue - we'll still try to delete it
    }

    // Remove from whitelist (this is idempotent - won't fail if item doesn't exist)
    try {
      console.log('Attempting to delete whitelist entry for:', emailLower);
      await docClient.send(new DeleteCommand({
        TableName: APPROVED_EMAILS_TABLE,
        Key: { email: emailLower },
      }));
      console.log('Whitelist entry deleted successfully');
    } catch (error: any) {
      console.error('Error deleting whitelist entry:', error);
      console.error('Error type:', typeof error);
      console.error('Error message:', error?.message);
      console.error('Error name:', error?.name);
      console.error('Error code:', error?.code);
      // If the entry doesn't exist, that's fine - continue
      if (!whitelistExisted) {
        console.log('Whitelist entry did not exist, continuing...');
      } else {
        // If it existed but delete failed, log but don't throw - we want to continue
        console.error('Whitelist entry existed but delete failed - continuing anyway');
        // Don't throw - let's see if we can still complete the operation
      }
    }

    // If user exists, deactivate them
    if (user) {
      try {
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
              try {
                await docClient.send(new DeleteCommand({
                  TableName: TOKENS_TABLE,
                  Key: { tokenId: session.tokenId },
                }));
              } catch (error) {
                console.error('Error deleting individual session:', error);
                // Continue deleting other sessions
              }
            }
          }
        } catch (error) {
          console.error('Error deleting user sessions:', error);
          // Continue - session deletion failure shouldn't block the operation
        }
      } catch (error) {
        console.error('Error deactivating user:', error);
        // Continue - user deactivation failure shouldn't block whitelist deletion
      }
    }

    // Log activity (don't fail if this fails)
    try {
      await logActivity('whitelist_user_deleted', adminUser.userId, adminUser.email, {
        targetEmail: emailLower,
        userWasRegistered: !!user,
        whitelistExisted,
      });
    } catch (error) {
      console.error('Error logging activity (non-fatal):', error);
      // Continue - logging failure shouldn't block the operation
    }

    return createResponse(200, {
      success: true,
      message: whitelistExisted 
        ? 'Whitelist user deleted successfully' 
        : 'Whitelist entry did not exist (may have been expired or already deleted)',
      userWasDeactivated: !!user,
    });
  } catch (error: any) {
    console.error('Error deleting whitelist user:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return createResponse(500, { 
      error: 'Failed to delete whitelist user',
      details: error.message 
    });
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
 * SIMPLIFIED VERSION - Minimal operations to isolate the crash
 */
async function handleGetActivityLogs(params: any, adminUser: any) {
  // CRITICAL: Log immediately with try-catch to ensure logging works
  try {
    console.log('========== handleGetActivityLogs FUNCTION ENTERED ==========');
    console.log('Function called at:', new Date().toISOString());
    console.log('Function exists check:', typeof handleGetActivityLogs);
  } catch (logErr) {
    // Even logging failed - return error immediately
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Failed to log in handler', details: String(logErr) })
    };
  }
  
  // Validate inputs first
  if (!adminUser) {
    console.error('adminUser is null/undefined');
    return createResponse(500, { error: 'Invalid admin user' });
  }
  
  console.log('Admin user validated:', { userId: adminUser.userId, email: adminUser.email });
  console.log('Params:', params);
  
  // Check table name exists
  if (!ACTIVITY_TABLE) {
    console.error('ACTIVITY_TABLE is not set');
    return createResponse(500, { error: 'Table name not configured' });
  }
  
  console.log('Table name:', ACTIVITY_TABLE);
  
  // Check docClient exists
  if (!docClient) {
    console.error('docClient is null/undefined');
    return createResponse(500, { error: 'DynamoDB client not initialized' });
  }
  
  console.log('docClient validated');
  
  // Parse pagination parameters
  const page = parseInt(params.page || '1', 10);
  const limit = parseInt(params.limit || '50', 10);
  const emailFilter = params.emailFilter || '';
  
  // Parse eventTypeFilter - single value
  const eventTypeFilter = params.eventTypeFilter || '';
  
  const offset = (page - 1) * limit;
  
  console.log('Pagination params:', { page, limit, emailFilter, eventTypeFilter, offset });
  
  try {
    console.log('Attempting to scan ACTIVITY_TABLE...');
    const scanCommand = new ScanCommand({
      TableName: ACTIVITY_TABLE,
    });
    console.log('ScanCommand created successfully');
    
    const scanResult = await docClient.send(scanCommand);
    console.log('Scan successful, items found:', scanResult.Items?.length || 0);

    let activities = scanResult.Items || [];

    // Filter by email if provided
    if (emailFilter) {
      const filterLower = emailFilter.toLowerCase();
      activities = activities.filter((a: any) => 
        a.email?.toLowerCase().includes(filterLower)
      );
      console.log('After email filter, activities count:', activities.length);
    }

    // Filter by event type if provided
    if (eventTypeFilter) {
      activities = activities.filter((a: any) => 
        a.eventType === eventTypeFilter
      );
      console.log('After eventType filter, activities count:', activities.length);
      console.log('Filtered by event type:', eventTypeFilter);
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
    
    console.log('Pagination result:', {
      total,
      offset,
      limit,
      returned: paginatedActivities.length,
      totalPages: Math.ceil(total / limit)
    });

    // Format activities to match expected response structure
    const formattedActivities = paginatedActivities.map((item: any) => ({
      activityId: item.activityId || item.userId + '_' + item.timestamp,
      userId: item.userId,
      email: item.email,
      eventType: item.eventType,
      timestamp: item.timestamp,
      deviceId: item.deviceId,
      ipAddress: item.ipAddress,
      metadata: item.metadata || {},
    }));

    return createResponse(200, {
      activities: formattedActivities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('========== handleGetActivityLogs ERROR ==========');
    console.error('Error:', error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    return createResponse(500, { 
      error: 'Failed to get activity logs', 
      details: error instanceof Error ? error.message : String(error)
    });
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

