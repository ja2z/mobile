/**
 * Shared User Validation Utility
 * Provides functions for validating user expiration and deactivation status
 * Can be imported by multiple Lambda functions
 */

import { getUserProfile, getUserProfileByEmail, UserProfile } from './user-service';

// Re-export UserProfile type for backward compatibility
export type { UserProfile };

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
    const user = await getUserProfile(userId);
    
    if (!user) {
      return null;
    }
    
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

// Re-export functions from user-service for backward compatibility
export { getUserProfile, getUserProfileByEmail };

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

