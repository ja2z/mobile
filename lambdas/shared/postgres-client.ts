/**
 * PostgreSQL Client Module
 * Provides connection pooling and database operations for Lambda functions
 * Uses Secrets Manager for credentials
 */

// Note: pg module is available at build time from each lambda's node_modules
// The linting errors here are false positives - the module resolves correctly when building from within each lambda directory
import { Pool, PoolClient } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Initialize Secrets Manager client
const secretsClient = new SecretsManagerClient({});

// Connection pool (initialized lazily)
let pool: Pool | null = null;

// Cached credentials
let cachedCredentials: {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
} | null = null;

/**
 * Get PostgreSQL credentials from Secrets Manager
 */
async function getCredentials(): Promise<{
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const secretName = process.env.POSTGRES_SECRET_NAME || 'mobile-app/postgres-credentials';

  try {
    const command = new GetSecretValueCommand({
      SecretId: secretName,
    });

    const response = await secretsClient.send(command);
    const secretString = response.SecretString || '{}';
    const credentials = JSON.parse(secretString);

    cachedCredentials = {
      host: credentials.host,
      port: credentials.port || 5432,
      database: credentials.database || process.env.POSTGRES_DATABASE || 'mobile_app',
      username: credentials.username,
      password: credentials.password,
      ssl: credentials.ssl !== false, // Default to true
    };

    return cachedCredentials;
  } catch (error) {
    console.error('Error fetching PostgreSQL credentials from Secrets Manager:', error);
    throw new Error(`Failed to fetch PostgreSQL credentials: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get or create PostgreSQL connection pool
 * Connection pool is reused across Lambda invocations (warm starts)
 */
export async function getPool(): Promise<Pool> {
  if (pool) {
    return pool;
  }

  const credentials = await getCredentials();

  // RDS PostgreSQL requires SSL by default, but uses self-signed certificates
  // For VPC connections, we disable certificate validation since:
  // 1. Traffic is already encrypted within the VPC
  // 2. We trust the RDS instance (it's in our VPC)
  // 3. Self-signed certs would otherwise cause connection failures
  // Always use SSL with rejectUnauthorized: false for RDS connections
  pool = new Pool({
    host: credentials.host,
    port: credentials.port,
    database: credentials.database,
    user: credentials.username,
    password: credentials.password,
    ssl: {
      rejectUnauthorized: false, // Required for RDS self-signed certs in VPC
    },
    max: 5, // Maximum pool size (conservative for db.t3.micro)
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 5000, // Timeout after 5 seconds if connection cannot be established
  });

  // Handle pool errors
  pool.on('error', (err: Error) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
    // Don't throw - let Lambda handle it
  });

  return pool;
}

/**
 * Execute a query using the connection pool
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  const pool = await getPool();
  const start = Date.now();

  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`PostgreSQL query executed in ${duration}ms: ${text.substring(0, 50)}...`);
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0,
    };
  } catch (error) {
    console.error('PostgreSQL query error:', error);
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 * Remember to release the client when done!
 */
export async function getClient(): Promise<PoolClient> {
  const pool = await getPool();
  return pool.connect();
}

/**
 * Close the connection pool
 * Useful for cleanup or testing
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    cachedCredentials = null;
  }
}

