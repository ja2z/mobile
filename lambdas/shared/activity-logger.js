"use strict";
/**
 * Shared Activity Logging Utility
 * Provides functions for logging user activity and updating last active time
 * Can be imported by multiple Lambda functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logActivity = logActivity;
exports.updateLastActiveTime = updateLastActiveTime;
exports.logActivityAndUpdateLastActive = logActivityAndUpdateLastActive;
// Note: These AWS SDK modules are available at build time from each lambda's node_modules
// The linting errors here are false positives - the modules resolve correctly when building from within each lambda directory
// @ts-expect-error - Module resolution works at build time from lambda directories
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
// @ts-expect-error - Module resolution works at build time from lambda directories
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const crypto_1 = require("crypto");
// Initialize AWS clients
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
// Environment variables
const ACTIVITY_TABLE = process.env.ACTIVITY_TABLE || 'mobile-user-activity';
const USERS_TABLE = process.env.USERS_TABLE || 'mobile-users';
/**
 * Log user activity
 * @param eventType - Type of event (e.g., "login", "app_launch", "applet_launch", "failed_login")
 * @param userId - User ID
 * @param email - User email
 * @param metadata - Additional event-specific data
 * @param deviceId - Optional device ID
 * @param ipAddress - Optional IP address
 */
async function logActivity(eventType, userId, email, metadata = {}, deviceId, ipAddress) {
    try {
        const now = Math.floor(Date.now() / 1000);
        const activityId = `act_${(0, crypto_1.randomBytes)(16).toString('hex')}`;
        const activity = {
            activityId,
            userId,
            email: email.toLowerCase(),
            eventType,
            timestamp: now,
            ...(deviceId && { deviceId }),
            ...(ipAddress && { ipAddress }),
            ...(Object.keys(metadata).length > 0 && { metadata }),
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: ACTIVITY_TABLE,
            Item: activity,
        }));
        console.log(`Activity logged: ${eventType} for user ${userId}`);
    }
    catch (error) {
        console.error('Error logging activity:', error);
        // Don't throw - activity logging should not break the main flow
    }
}
/**
 * Update user's last active time
 * @param userId - User ID to update
 */
async function updateLastActiveTime(userId) {
    try {
        const now = Math.floor(Date.now() / 1000);
        await docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: USERS_TABLE,
            Key: { userId },
            UpdateExpression: 'SET lastActiveAt = :now',
            ExpressionAttributeValues: {
                ':now': now,
            },
        }));
        console.log(`Updated lastActiveAt for user ${userId}`);
    }
    catch (error) {
        console.error('Error updating last active time:', error);
        // Don't throw - last active time update should not break the main flow
    }
}
/**
 * Log activity and update last active time in one call
 * @param eventType - Type of event
 * @param userId - User ID
 * @param email - User email
 * @param metadata - Additional event-specific data
 * @param deviceId - Optional device ID
 * @param ipAddress - Optional IP address
 */
async function logActivityAndUpdateLastActive(eventType, userId, email, metadata = {}, deviceId, ipAddress) {
    // Log activity and update last active time in parallel
    await Promise.all([
        logActivity(eventType, userId, email, metadata, deviceId, ipAddress),
        updateLastActiveTime(userId),
    ]);
}
