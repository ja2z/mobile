/**
 * DynamoDB to PostgreSQL Migration Script
 * Migrates activity logs from DynamoDB to PostgreSQL
 * Idempotent: Uses INSERT ... ON CONFLICT DO NOTHING to skip duplicates
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Pool } from 'pg';

// Configuration
const REGION = process.env.AWS_REGION || 'us-west-2';
const DYNAMODB_TABLE = process.env.ACTIVITY_TABLE || 'mobile-user-activity';
const SECRET_NAME = process.env.POSTGRES_SECRET_NAME || 'mobile-app/postgres-credentials';
const BATCH_SIZE = 1000;

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const secretsClient = new SecretsManagerClient({ region: REGION });

// PostgreSQL connection pool
let pool: Pool | null = null;

/**
 * Get PostgreSQL credentials from Secrets Manager
 */
async function getPostgresCredentials(): Promise<{
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}> {
  const command = new GetSecretValueCommand({
    SecretId: SECRET_NAME,
  });

  const response = await secretsClient.send(command);
  const credentials = JSON.parse(response.SecretString || '{}');

  return {
    host: credentials.host,
    port: credentials.port || 5432,
    database: credentials.database || 'mobile_app',
    username: credentials.username,
    password: credentials.password,
  };
}

/**
 * Initialize PostgreSQL connection pool
 */
async function initPostgresPool(): Promise<Pool> {
  if (pool) {
    return pool;
  }

  const credentials = await getPostgresCredentials();

  // Create schema if it doesn't exist
  const tempPool = new Pool({
    host: credentials.host,
    port: credentials.port,
    database: credentials.database,
    user: credentials.username,
    password: credentials.password,
    ssl: { rejectUnauthorized: true },
    max: 1, // Use single connection for schema creation
  });

  // Create table and indexes if they don't exist
  await tempPool.query(`
    CREATE TABLE IF NOT EXISTS user_activity (
      activity_id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      timestamp BIGINT NOT NULL,
      device_id VARCHAR(255),
      ip_address VARCHAR(45),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await tempPool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_activity_user_id_timestamp 
    ON user_activity(user_id, timestamp DESC);
  `);

  await tempPool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_activity_event_type 
    ON user_activity(event_type);
  `);

  await tempPool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_activity_email 
    ON user_activity(email);
  `);

  await tempPool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_activity_timestamp 
    ON user_activity(timestamp DESC);
  `);

  await tempPool.end();

  // Create main pool
  pool = new Pool({
    host: credentials.host,
    port: credentials.port,
    database: credentials.database,
    user: credentials.username,
    password: credentials.password,
    ssl: { rejectUnauthorized: true },
    max: 10, // Connection pool for batch inserts
  });

  return pool;
}

/**
 * Get DynamoDB row count
 */
async function getDynamoDBCount(): Promise<number> {
  console.log('📊 Getting DynamoDB row count...');
  const result = await docClient.send(
    new ScanCommand({
      TableName: DYNAMODB_TABLE,
      Select: 'COUNT',
    })
  );
  const count = result.Count || 0;
  console.log(`   DynamoDB row count: ${count}`);
  return count;
}

/**
 * Migrate DynamoDB items to PostgreSQL
 */
async function migrateData(): Promise<void> {
  console.log('🚀 Starting migration...');
  console.log('');

  // Initialize PostgreSQL pool
  const pgPool = await initPostgresPool();
  console.log('✓ PostgreSQL connection established');
  console.log('');

  // Get DynamoDB count
  const dynamoDBCount = await getDynamoDBCount();
  console.log('');

  let lastEvaluatedKey: any = undefined;
  let totalProcessed = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let batchNumber = 0;

  do {
    batchNumber++;
    console.log(`📦 Processing batch ${batchNumber}...`);

    // Scan DynamoDB
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: DYNAMODB_TABLE,
        ExclusiveStartKey: lastEvaluatedKey,
        Limit: BATCH_SIZE,
      })
    );

    const items = scanResult.Items || [];
    lastEvaluatedKey = scanResult.LastEvaluatedKey;

    if (items.length === 0) {
      console.log('   No items in this batch');
      continue;
    }

    console.log(`   Found ${items.length} items in DynamoDB`);

    // Prepare batch insert
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const item of items) {
      const metadataJson =
        item.metadata && Object.keys(item.metadata).length > 0
          ? JSON.stringify(item.metadata)
          : null;

      values.push(
        item.activityId || `act_${item.userId}_${item.timestamp}`,
        item.userId,
        item.email || '',
        item.eventType || '',
        item.timestamp || 0,
        item.deviceId || null,
        item.ipAddress || null,
        metadataJson
      );

      placeholders.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}::jsonb)`
      );
      paramIndex += 8;
    }

    // Batch insert with ON CONFLICT DO NOTHING (idempotent)
    const insertQuery = `
      INSERT INTO user_activity (
        activity_id, user_id, email, event_type, timestamp,
        device_id, ip_address, metadata
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (activity_id) DO NOTHING
    `;

    try {
      const result = await pgPool.query(insertQuery, values);
      const inserted = result.rowCount || 0;
      const skipped = items.length - inserted;

      totalProcessed += items.length;
      totalInserted += inserted;
      totalSkipped += skipped;

      console.log(`   ✓ Inserted: ${inserted}, Skipped (duplicates): ${skipped}`);
    } catch (error) {
      console.error(`   ✗ Error inserting batch:`, error);
      totalErrors += items.length;
      totalProcessed += items.length;
    }

    console.log(`   Progress: ${totalProcessed} items processed`);
    console.log('');
  } while (lastEvaluatedKey);

  // Get PostgreSQL count
  console.log('📊 Getting PostgreSQL row count...');
  const pgResult = await pgPool.query('SELECT COUNT(*) as count FROM user_activity');
  const pgCount = parseInt(pgResult.rows[0].count, 10);
  console.log(`   PostgreSQL row count: ${pgCount}`);
  console.log('');

  // Close pool
  await pgPool.end();

  // Migration report
  console.log('==========================================');
  console.log('✅ Migration Complete!');
  console.log('==========================================');
  console.log('');
  console.log('Migration Report:');
  console.log(`  DynamoDB items: ${dynamoDBCount}`);
  console.log(`  Items processed: ${totalProcessed}`);
  console.log(`  Items inserted: ${totalInserted}`);
  console.log(`  Items skipped (duplicates): ${totalSkipped}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log(`  PostgreSQL total rows: ${pgCount}`);
  console.log('');

  // Verification
  if (totalErrors === 0) {
    const expectedCount = dynamoDBCount;
    const actualCount = pgCount;
    const difference = Math.abs(expectedCount - actualCount);

    if (difference <= totalSkipped) {
      console.log('✅ Verification: Row counts match (accounting for duplicates)');
      console.log(`   Expected: ~${expectedCount}, Actual: ${actualCount}, Difference: ${difference}`);
    } else {
      console.log('⚠️  Warning: Row count mismatch');
      console.log(`   Expected: ~${expectedCount}, Actual: ${actualCount}, Difference: ${difference}`);
      console.log('   This may be normal if there were duplicates in DynamoDB');
    }
  } else {
    console.log('⚠️  Warning: Some errors occurred during migration');
    console.log(`   ${totalErrors} items failed to migrate`);
  }
  console.log('');
}

// Run migration
migrateData()
  .then(() => {
    console.log('Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });

