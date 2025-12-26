/**
 * Shared User Validation Utility
 * Provides functions for validating user expiration and deactivation status
 * Can be imported by multiple Lambda functions
 */

// Note: These AWS SDK modules are available at build time from each lambda's node_modules
// The linting errors here are false positives - the modules resolve correctly when building from within each lambda directory
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Environment variables
const USERS_TABLE = process.env.USERS_TABLE || 'mobile-users';

export interface UserProfile {
  userId: string;
  email: string;
  role: string;
  expirationDate?: number;
  isDeactivated?: boolean;
  deactivatedAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Validate user expiration
 * User expiration takes priority over JWT expiration
 * @param userId - User ID to check
 * @param jwtExpirationDate - JWT expiration timestamp (optional, for comparison)
 * @returns true if user is expired, false otherwise
 */
export async function validateUserExpiration(
  userId: string,
  jwtExpirationDate?: number
): Promise<{ expired: boolean; reason?: string }> {
  try {
    const user = await getUserProfile(userId);
    
    if (!user) {
      return { expired: true, reason: 'User not found' };
    }

    // Check if user is deactivated
    if (user.isDeactivated) {
      return { expired: true, reason: 'User is deactivated' };
    }

    // Check user expiration date (takes priority over JWT expiration)
    if (user.expirationDate) {
      const now = Math.floor(Date.now() / 1000);
      if (now >= user.expirationDate) {
        return { expired: true, reason: 'User account has expired' };
      }
    }

    // If no user expiration, check JWT expiration
    if (jwtExpirationDate) {
      const now = Math.floor(Date.now() / 1000);
      if (now >= jwtExpirationDate) {
        return { expired: true, reason: 'Session token has expired' };
      }
    }

    return { expired: false };
  } catch (error) {
    console.error('Error validating user expiration:', error);
    // On error, assume not expired to avoid blocking legitimate requests
    return { expired: false };
  }
}

/**
 * Check if user is deactivated
 * @param userId - User ID to check
 * @returns true if user is deactivated, false otherwise
 */
export async function checkUserDeactivated(userId: string): Promise<boolean> {
  try {
    const user = await getUserProfile(userId);
    return user?.isDeactivated === true;
  } catch (error) {
    console.error('Error checking user deactivation:', error);
    return false;
  }
}

/**
 * Get user profile with validation
 * Returns user profile if valid, null otherwise
 * @param userId - User ID to fetch
 * @returns User profile or null if not found/invalid
 */
export async function getUserProfileWithValidation(userId: string): Promise<UserProfile | null> {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId }
    }));

    if (!result.Item) {
      return null;
    }

    const user = result.Item as UserProfile;
    
    // If user is deactivated, return null
    if (user.isDeactivated) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

/**
 * Get user profile by userId
 * @param userId - User ID to fetch
 * @returns User profile or null if not found
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId }
    }));

    if (!result.Item) {
      return null;
    }

    return result.Item as UserProfile;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

/**
 * Get user profile by email
 * @param email - Email address to lookup
 * @returns User profile or null if not found
 */
export async function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
  try {
    const emailLower = email.toLowerCase();
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

    return result.Items[0] as UserProfile;
  } catch (error) {
    console.error('Error getting user profile by email:', error);
    return null;
  }
}

/**
 * Validate role - only allow "basic" and "admin"
 */
export function validateRole(role: string | undefined): string | null {
  if (!role) {
    return null;
  }
  // Only allow "basic" and "admin" roles
  if (role === 'basic' || role === 'admin') {
    return role;
  }
  // Invalid role, return null to use default
  console.warn(`Invalid role "${role}" detected, defaulting to "basic"`);
  return null;
}

