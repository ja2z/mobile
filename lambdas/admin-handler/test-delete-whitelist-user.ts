#!/usr/bin/env ts-node

/**
 * Test script to simulate API Gateway DELETE request for whitelist user
 * This simulates the exact event structure that API Gateway sends to Lambda
 */

import { handler } from './index';

// Mock environment variables
process.env.USERS_TABLE = 'mobile-users';
process.env.APPROVED_EMAILS_TABLE = 'mobile-approved-emails';
process.env.TOKENS_TABLE = 'mobile-auth-tokens';
process.env.ACTIVITY_TABLE = 'mobile-user-activity';
process.env.JWT_SECRET_NAME = 'mobile-app/jwt-secret';

// You'll need to get a valid JWT token - replace this with an actual admin token
const ADMIN_JWT_TOKEN = process.env.TEST_ADMIN_JWT || 'REPLACE_WITH_ACTUAL_JWT_TOKEN';

async function testDeleteWhitelistUser(email: string) {
  console.log('='.repeat(80));
  console.log('Testing DELETE whitelist user:', email);
  console.log('='.repeat(80));
  
  // Simulate different possible API Gateway event structures
  const testCases = [
    {
      name: 'Test Case 1: Path with URL-encoded email',
      event: {
        path: `/v1/admin/whitelist/${encodeURIComponent(email)}`,
        httpMethod: 'DELETE',
        headers: {
          'Authorization': `Bearer ${ADMIN_JWT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        pathParameters: null,
        queryStringParameters: null,
        body: null,
        requestContext: {
          path: `/v1/admin/whitelist/${encodeURIComponent(email)}`,
          resourcePath: `/admin/whitelist/{email}`,
          httpMethod: 'DELETE',
          requestId: 'test-request-1',
          stage: 'v1',
        },
      },
    },
    {
      name: 'Test Case 2: Path with decoded email',
      event: {
        path: `/v1/admin/whitelist/${email}`,
        httpMethod: 'DELETE',
        headers: {
          'Authorization': `Bearer ${ADMIN_JWT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        pathParameters: null,
        queryStringParameters: null,
        body: null,
        requestContext: {
          path: `/v1/admin/whitelist/${email}`,
          resourcePath: `/admin/whitelist/{email}`,
          httpMethod: 'DELETE',
          requestId: 'test-request-2',
          stage: 'v1',
        },
      },
    },
    {
      name: 'Test Case 3: PathParameters with email',
      event: {
        path: '/v1/admin/whitelist',
        httpMethod: 'DELETE',
        headers: {
          'Authorization': `Bearer ${ADMIN_JWT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        pathParameters: {
          email: encodeURIComponent(email),
        },
        queryStringParameters: null,
        body: null,
        requestContext: {
          path: '/v1/admin/whitelist',
          resourcePath: '/admin/whitelist/{email}',
          httpMethod: 'DELETE',
          requestId: 'test-request-3',
          stage: 'v1',
        },
      },
    },
    {
      name: 'Test Case 4: PathParameters with decoded email',
      event: {
        path: '/v1/admin/whitelist',
        httpMethod: 'DELETE',
        headers: {
          'Authorization': `Bearer ${ADMIN_JWT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        pathParameters: {
          email: email,
        },
        queryStringParameters: null,
        body: null,
        requestContext: {
          path: '/v1/admin/whitelist',
          resourcePath: '/admin/whitelist/{email}',
          httpMethod: 'DELETE',
          requestId: 'test-request-4',
          stage: 'v1',
        },
      },
    },
    {
      name: 'Test Case 5: Path with /admin/ prefix (needs normalization)',
      event: {
        path: `/admin/whitelist/${encodeURIComponent(email)}`,
        httpMethod: 'DELETE',
        headers: {
          'Authorization': `Bearer ${ADMIN_JWT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        pathParameters: null,
        queryStringParameters: null,
        body: null,
        requestContext: {
          path: `/v1/admin/whitelist/${encodeURIComponent(email)}`,
          resourcePath: `/admin/whitelist/{email}`,
          httpMethod: 'DELETE',
          requestId: 'test-request-5',
          stage: 'v1',
        },
      },
    },
  ];

  for (const testCase of testCases) {
    console.log('\n' + '='.repeat(80));
    console.log(testCase.name);
    console.log('='.repeat(80));
    console.log('Event structure:');
    console.log(JSON.stringify(testCase.event, null, 2));
    console.log('\n--- Calling Lambda handler ---\n');
    
    try {
      const result = await handler(testCase.event as any, {} as any);
      
      console.log('Response status:', result.statusCode);
      console.log('Response body:', typeof result.body === 'string' ? JSON.parse(result.body) : result.body);
      
      if (result.statusCode === 200) {
        console.log('✅ SUCCESS!');
        return; // Stop on first success
      } else {
        console.log('❌ FAILED with status:', result.statusCode);
      }
    } catch (error: any) {
      console.error('❌ EXCEPTION:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    console.log('\n');
  }
  
  console.log('='.repeat(80));
  console.log('All test cases completed');
  console.log('='.repeat(80));
}

// Get email from command line
const email = process.argv[2];
if (!email) {
  console.error('Usage: ts-node test-delete-whitelist-user.ts <email>');
  console.error('Example: ts-node test-delete-whitelist-user.ts "javrach+junk@gmail.com"');
  console.error('\nNote: Set TEST_ADMIN_JWT environment variable with a valid admin JWT token');
  process.exit(1);
}

if (!ADMIN_JWT_TOKEN || ADMIN_JWT_TOKEN === 'REPLACE_WITH_ACTUAL_JWT_TOKEN') {
  console.error('ERROR: TEST_ADMIN_JWT environment variable not set or invalid');
  console.error('Please set it with a valid admin JWT token:');
  console.error('  export TEST_ADMIN_JWT="your-jwt-token-here"');
  process.exit(1);
}

testDeleteWhitelistUser(email).catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

