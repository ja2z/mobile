"use strict";
/**
 * Shared User Validation Utility
 * Provides functions for validating user expiration and deactivation status
 * Can be imported by multiple Lambda functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUserExpiration = validateUserExpiration;
exports.checkUserDeactivated = checkUserDeactivated;
exports.getUserProfileWithValidation = getUserProfileWithValidation;
exports.getUserProfile = getUserProfile;
exports.getUserProfileByEmail = getUserProfileByEmail;
exports.validateRole = validateRole;
// Note: These AWS SDK modules are available at build time from each lambda's node_modules
// The linting errors here are false positives - the modules resolve correctly when building from within each lambda directory
// @ts-expect-error - Module resolution works at build time from lambda directories
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
// @ts-expect-error - Module resolution works at build time from lambda directories
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
// Initialize AWS clients
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
// Environment variables
const USERS_TABLE = process.env.USERS_TABLE || 'mobile-users';
/**
 * Validate user expiration
 * User expiration takes priority over JWT expiration
 * @param userId - User ID to check
 * @param jwtExpirationDate - JWT expiration timestamp (optional, for comparison)
 * @returns true if user is expired, false otherwise
 */
async function validateUserExpiration(userId, jwtExpirationDate) {
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
    }
    catch (error) {
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
async function checkUserDeactivated(userId) {
    try {
        const user = await getUserProfile(userId);
        return user?.isDeactivated === true;
    }
    catch (error) {
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
async function getUserProfileWithValidation(userId) {
    try {
        const result = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: USERS_TABLE,
            Key: { userId }
        }));
        if (!result.Item) {
            return null;
        }
        const user = result.Item;
        // If user is deactivated, return null
        if (user.isDeactivated) {
            return null;
        }
        return user;
    }
    catch (error) {
        console.error('Error getting user profile:', error);
        return null;
    }
}
/**
 * Get user profile by userId
 * @param userId - User ID to fetch
 * @returns User profile or null if not found
 */
async function getUserProfile(userId) {
    try {
        const result = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: USERS_TABLE,
            Key: { userId }
        }));
        if (!result.Item) {
            return null;
        }
        return result.Item;
    }
    catch (error) {
        console.error('Error getting user profile:', error);
        return null;
    }
}
/**
 * Get user profile by email
 * @param email - Email address to lookup
 * @returns User profile or null if not found
 */
async function getUserProfileByEmail(email) {
    try {
        const emailLower = email.toLowerCase();
        const result = await docClient.send(new lib_dynamodb_1.QueryCommand({
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
    }
    catch (error) {
        console.error('Error getting user profile by email:', error);
        return null;
    }
}
/**
 * Validate role - only allow "basic" and "admin"
 */
function validateRole(role) {
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
