#!/usr/bin/env node

/**
 * Direct test of handleDeleteWhitelistUser function
 * Bypasses API Gateway routing to test the core function directly
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, DeleteCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// Set AWS profile and region
process.env.AWS_PROFILE = 'saml';
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';

const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const APPROVED_EMAILS_TABLE = process.env.APPROVED_EMAILS_TABLE || 'mobile-approved-emails';
const USERS_TABLE = process.env.USERS_TABLE || 'mobile-users';
const TOKENS_TABLE = process.env.TOKENS_TABLE || 'mobile-auth-tokens';

// Import the shared functions (we'll need to mock or import them)
// For now, let's implement a simplified version to test

async function getUserProfileByEmail(email) {
  try {
    const emailLower = email.toLowerCase();
    const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
    const result = await docClient.send(new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': emailLower },
      Limit: 1
    }));

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return result.Items[0];
  } catch (error) {
    console.error('Error getting user profile by email:', error);
    return null;
  }
}

async function testDeleteWhitelistUserDirect(email) {
  console.log('='.repeat(80));
  console.log('Direct test of delete whitelist user logic');
  console.log('Email:', email);
  console.log('='.repeat(80));
  
  const emailLower = email.toLowerCase();
  console.log('\n1. Normalized email:', emailLower);
  
  try {
    // Step 1: Check if user has registered
    console.log('\n2. Checking if user has registered...');
    let user = null;
    try {
      user = await getUserProfileByEmail(emailLower);
      if (user) {
        console.log('   ✓ User found:', user.userId);
      } else {
        console.log('   ✓ No user found (user has not registered)');
      }
    } catch (error) {
      console.error('   ✗ Error looking up user profile:', error.message);
      user = null;
    }

    // Step 2: Check if whitelist entry exists
    console.log('\n3. Checking if whitelist entry exists...');
    let whitelistExisted = false;
    try {
      const whitelistCheck = await docClient.send(new GetCommand({
        TableName: APPROVED_EMAILS_TABLE,
        Key: { email: emailLower },
      }));
      whitelistExisted = !!whitelistCheck.Item;
      console.log('   Whitelist entry exists:', whitelistExisted);
      if (whitelistCheck.Item) {
        console.log('   Whitelist entry details:', JSON.stringify({
          email: whitelistCheck.Item.email,
          role: whitelistCheck.Item.role,
          expirationDate: whitelistCheck.Item.expirationDate,
          approvedBy: whitelistCheck.Item.approvedBy,
        }, null, 2));
      }
    } catch (error) {
      console.error('   ✗ Error checking whitelist entry:', error.message);
    }

    // Step 3: Delete whitelist entry
    console.log('\n4. Deleting whitelist entry...');
    try {
      await docClient.send(new DeleteCommand({
        TableName: APPROVED_EMAILS_TABLE,
        Key: { email: emailLower },
      }));
      console.log('   ✓ Whitelist entry deleted successfully');
    } catch (error) {
      console.error('   ✗ Error deleting whitelist entry:', error.message);
      console.error('   Error details:', error);
      throw error;
    }

    // Step 4: If user exists, deactivate them
    if (user) {
      console.log('\n5. User exists, deactivating...');
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
        console.log('   ✓ User deactivated successfully');
      } catch (error) {
        console.error('   ✗ Error deactivating user:', error.message);
      }

      // Step 5: Delete user sessions
      console.log('\n6. Deleting user sessions...');
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

        if (sessionsResult.Items && sessionsResult.Items.length > 0) {
          console.log(`   Found ${sessionsResult.Items.length} sessions to delete`);
          for (const session of sessionsResult.Items) {
            try {
              await docClient.send(new DeleteCommand({
                TableName: TOKENS_TABLE,
                Key: { tokenId: session.tokenId },
              }));
            } catch (error) {
              console.error(`   ✗ Error deleting session ${session.tokenId}:`, error.message);
            }
          }
          console.log('   ✓ Sessions deleted');
        } else {
          console.log('   ✓ No sessions found');
        }
      } catch (error) {
        console.error('   ✗ Error deleting user sessions:', error.message);
      }
    } else {
      console.log('\n5. No user found, skipping deactivation and session deletion');
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ TEST COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(80));
    console.error('Error:', error.message);
    console.error('Error name:', error.name);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
}

// Get email from command line
const email = process.argv[2];
if (!email) {
  console.error('Usage: node test-delete-direct.js <email>');
  console.error('Example: node test-delete-direct.js "javrach+junk@gmail.com"');
  process.exit(1);
}

testDeleteWhitelistUserDirect(email).catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

