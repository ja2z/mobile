#!/usr/bin/env node

/**
 * Test script to debug whitelist user deletion
 * Tests deleting a specific user to identify the issue
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

// Set AWS profile and region
process.env.AWS_PROFILE = 'saml';
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';

const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const APPROVED_EMAILS_TABLE = process.env.APPROVED_EMAILS_TABLE || 'mobile-approved-emails';
const USERS_TABLE = process.env.USERS_TABLE || 'mobile-users';
const TOKENS_TABLE = process.env.TOKENS_TABLE || 'mobile-auth-tokens';

async function testDeleteUser(email) {
  console.log('='.repeat(60));
  console.log('Testing deletion of whitelist user:', email);
  console.log('='.repeat(60));
  
  const emailLower = email.toLowerCase();
  console.log('\n1. Normalized email:', emailLower);
  
  try {
    // Step 1: Check if whitelist entry exists
    console.log('\n2. Checking if whitelist entry exists...');
    let whitelistExisted = false;
    try {
      const whitelistCheck = await docClient.send(new GetCommand({
        TableName: APPROVED_EMAILS_TABLE,
        Key: { email: emailLower },
      }));
      whitelistExisted = !!whitelistCheck.Item;
      console.log('   Whitelist entry exists:', whitelistExisted);
      if (whitelistCheck.Item) {
        console.log('   Whitelist entry:', JSON.stringify(whitelistCheck.Item, null, 2));
      }
    } catch (error) {
      console.error('   ERROR checking whitelist:', error.message);
      console.error('   Error details:', error);
    }
    
    // Step 2: Check if user exists
    console.log('\n3. Checking if user profile exists...');
    let user = null;
    try {
      const queryResult = await docClient.send(new QueryCommand({
        TableName: USERS_TABLE,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': emailLower },
        Limit: 1
      }));
      
      if (queryResult.Items && queryResult.Items.length > 0) {
        user = queryResult.Items[0];
        console.log('   User found:', user.userId);
        console.log('   User details:', JSON.stringify({
          userId: user.userId,
          email: user.email,
          role: user.role,
          isDeactivated: user.isDeactivated,
          expirationDate: user.expirationDate,
        }, null, 2));
      } else {
        console.log('   No user profile found');
      }
    } catch (error) {
      console.error('   ERROR looking up user:', error.message);
      console.error('   Error details:', error);
    }
    
    // Step 3: Try to delete whitelist entry
    console.log('\n4. Attempting to delete whitelist entry...');
    try {
      await docClient.send(new DeleteCommand({
        TableName: APPROVED_EMAILS_TABLE,
        Key: { email: emailLower },
      }));
      console.log('   ✓ Whitelist entry deleted successfully');
    } catch (error) {
      console.error('   ERROR deleting whitelist entry:', error.message);
      console.error('   Error code:', error.name);
      console.error('   Error details:', error);
      throw error;
    }
    
    // Step 4: If user exists, try to deactivate
    if (user) {
      console.log('\n5. User exists, attempting to deactivate...');
      try {
        const now = Math.floor(Date.now() / 1000);
        const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
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
        console.error('   ERROR deactivating user:', error.message);
        console.error('   Error details:', error);
      }
      
      // Step 5: Try to delete sessions
      console.log('\n6. Attempting to delete user sessions...');
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
              console.error(`   ERROR deleting session ${session.tokenId}:`, error.message);
            }
          }
          console.log('   ✓ Sessions deleted');
        } else {
          console.log('   No sessions found');
        }
      } catch (error) {
        console.error('   ERROR querying/deleting sessions:', error.message);
        console.error('   Error details:', error);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✓ Test completed successfully');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('✗ Test failed with error:');
    console.error('='.repeat(60));
    console.error('Error message:', error.message);
    console.error('Error name:', error.name);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
}

// Get email from command line argument
const email = process.argv[2];
if (!email) {
  console.error('Usage: node test-delete-user.js <email>');
  console.error('Example: node test-delete-user.js "javrach+junk@gmail.com"');
  process.exit(1);
}

testDeleteUser(email).catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

