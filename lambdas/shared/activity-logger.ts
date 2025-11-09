/**
 * Shared Activity Logging Utility
 * Provides functions for logging user activity and updating last active time
 * Can be imported by multiple Lambda functions
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'crypto';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Environment variables
const ACTIVITY_TABLE = process.env.ACTIVITY_TABLE || 'mobile-user-activity';
const USERS_TABLE = process.env.USERS_TABLE || 'mobile-users';

export interface ActivityLog {
  activityId: string;
  userId: string;
  email: string;
  eventType: string;
  timestamp: number;
  deviceId?: string;
  ipAddress?: string;
  metadata?: Record<string, any>;
}

/**
 * Log user activity
 * @param eventType - Type of event (e.g., "login", "app_launch", "applet_launch", "failed_login")
 * @param userId - User ID
 * @param email - User email
 * @param metadata - Additional event-specific data
 * @param deviceId - Optional device ID
 * @param ipAddress - Optional IP address
 */
export async function logActivity(
  eventType: string,
  userId: string,
  email: string,
  metadata: Record<string, any> = {},
  deviceId?: string,
  ipAddress?: string
): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const activityId = `act_${randomBytes(16).toString('hex')}`;

    const activity: ActivityLog = {
      activityId,
      userId,
      email: email.toLowerCase(),
      eventType,
      timestamp: now,
      ...(deviceId && { deviceId }),
      ...(ipAddress && { ipAddress }),
      ...(Object.keys(metadata).length > 0 && { metadata }),
    };

    await docClient.send(new PutCommand({
      TableName: ACTIVITY_TABLE,
      Item: activity,
    }));

    console.log(`Activity logged: ${eventType} for user ${userId}`);
  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw - activity logging should not break the main flow
  }
}

/**
 * Update user's last active time
 * @param userId - User ID to update
 */
export async function updateLastActiveTime(userId: string): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);

    await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: 'SET lastActiveAt = :now',
      ExpressionAttributeValues: {
        ':now': now,
      },
    }));

    console.log(`Updated lastActiveAt for user ${userId}`);
  } catch (error) {
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
export async function logActivityAndUpdateLastActive(
  eventType: string,
  userId: string,
  email: string,
  metadata: Record<string, any> = {},
  deviceId?: string,
  ipAddress?: string
): Promise<void> {
  // Log activity and update last active time in parallel
  await Promise.all([
    logActivity(eventType, userId, email, metadata, deviceId, ipAddress),
    updateLastActiveTime(userId),
  ]);
}

