#!/bin/bash

# Setup RDS PostgreSQL Database for Activity Logging
# Creates RDS instance, security groups, database schema, and stores credentials in Secrets Manager

set -e  # Exit on any error

# Set AWS profile and disable SSL verification
export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# AWS CLI wrapper to filter warnings
aws_cmd() {
    aws "$@" --no-verify-ssl 2> >(grep -v "InsecureRequestWarning" >&2)
}

# Configuration
REGION="us-west-2"
DB_INSTANCE_IDENTIFIER="mobile-activity-db"
DB_NAME="mobile_app"
DB_USERNAME="mobile_app_user"
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)  # Generate secure password
DB_INSTANCE_CLASS="db.t3.micro"
DB_ENGINE="postgres"
DB_ENGINE_VERSION="16.6"
STORAGE_SIZE=20
SECRET_NAME="mobile-app/postgres-credentials"

# Security Group Names
LAMBDA_SG_NAME="lambda-activity-logging-sg"
RDS_SG_NAME="rds-postgres-sg"

# Sigma IPs for whitelisting
SIGMA_IP_1="104.197.169.18/32"
SIGMA_IP_2="104.197.193.23/32"

echo "=========================================="
echo "Setting up RDS PostgreSQL Database"
echo "=========================================="
echo ""

# Verify authentication
echo "🔐 Checking AWS authentication..."
if ! aws_cmd sts get-caller-identity --query 'Account' --output text > /dev/null 2>&1; then
    echo "✗ ERROR: AWS CLI not authenticated"
    echo "   Please run: export AWS_PROFILE=saml"
    echo "   Then re-authenticate via Okta/SAML"
    exit 1
fi
echo "✓ AWS CLI authenticated"
echo ""

# Get default VPC
echo "📋 Finding default VPC..."
DEFAULT_VPC_ID=$(aws_cmd ec2 describe-vpcs \
    --region "$REGION" \
    --filters "Name=isDefault,Values=true" \
    --query 'Vpcs[0].VpcId' \
    --output text)

if [ -z "$DEFAULT_VPC_ID" ] || [ "$DEFAULT_VPC_ID" = "None" ]; then
    echo "✗ ERROR: No default VPC found"
    echo "   Please specify a VPC ID manually"
    exit 1
fi

echo "✓ Found default VPC: $DEFAULT_VPC_ID"
echo ""

# Get subnets in default VPC (need at least 2 in different AZs)
echo "📋 Finding subnets in default VPC..."
# Get first subnet from us-west-2a
SUBNET_1=$(aws_cmd ec2 describe-subnets \
    --region "$REGION" \
    --filters "Name=vpc-id,Values=$DEFAULT_VPC_ID" "Name=availability-zone,Values=us-west-2a" \
    --query 'Subnets[0].SubnetId' \
    --output text)

# Get first subnet from us-west-2b
SUBNET_2=$(aws_cmd ec2 describe-subnets \
    --region "$REGION" \
    --filters "Name=vpc-id,Values=$DEFAULT_VPC_ID" "Name=availability-zone,Values=us-west-2b" \
    --query 'Subnets[0].SubnetId' \
    --output text)

if [ -z "$SUBNET_1" ] || [ "$SUBNET_1" = "None" ] || [ -z "$SUBNET_2" ] || [ "$SUBNET_2" = "None" ]; then
    echo "✗ ERROR: Could not find subnets in at least 2 different availability zones"
    exit 1
fi

SUBNET_IDS="$SUBNET_1 $SUBNET_2"
SUBNET_AZS="us-west-2a us-west-2b"

echo "✓ Found subnets: $SUBNET_IDS"
echo "  Availability Zones: $SUBNET_AZS"
echo ""

# Step 1: Create Lambda Security Group
echo "Step 1: Creating Lambda Security Group..."
LAMBDA_SG_ID=$(aws_cmd ec2 describe-security-groups \
    --region "$REGION" \
    --filters "Name=group-name,Values=$LAMBDA_SG_NAME" "Name=vpc-id,Values=$DEFAULT_VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "")

if [ -z "$LAMBDA_SG_ID" ] || [ "$LAMBDA_SG_ID" = "None" ]; then
    echo "  Creating security group: $LAMBDA_SG_NAME"
    LAMBDA_SG_ID=$(aws_cmd ec2 create-security-group \
        --region "$REGION" \
        --group-name "$LAMBDA_SG_NAME" \
        --description "Security group for Lambda functions accessing RDS PostgreSQL" \
        --vpc-id "$DEFAULT_VPC_ID" \
        --query 'GroupId' \
        --output text)
    
    # Allow outbound PostgreSQL
    aws_cmd ec2 authorize-security-group-egress \
        --region "$REGION" \
        --group-id "$LAMBDA_SG_ID" \
        --ip-permissions IpProtocol=tcp,FromPort=5432,ToPort=5432,UserIdGroupPairs=[{GroupId=$LAMBDA_SG_ID}] 2>/dev/null || true
    
    # Allow outbound HTTPS for Secrets Manager
    aws_cmd ec2 authorize-security-group-egress \
        --region "$REGION" \
        --group-id "$LAMBDA_SG_ID" \
        --ip-permissions IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}] 2>/dev/null || true
    
    echo "  ✓ Lambda security group created: $LAMBDA_SG_ID"
else
    echo "  ✓ Lambda security group already exists: $LAMBDA_SG_ID"
fi
echo ""

# Step 2: Create RDS Security Group
echo "Step 2: Creating RDS Security Group..."
RDS_SG_ID=$(aws_cmd ec2 describe-security-groups \
    --region "$REGION" \
    --filters "Name=group-name,Values=$RDS_SG_NAME" "Name=vpc-id,Values=$DEFAULT_VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "")

if [ -z "$RDS_SG_ID" ] || [ "$RDS_SG_ID" = "None" ]; then
    echo "  Creating security group: $RDS_SG_NAME"
    RDS_SG_ID=$(aws_cmd ec2 create-security-group \
        --region "$REGION" \
        --group-name "$RDS_SG_NAME" \
        --description "Security group for RDS PostgreSQL database" \
        --vpc-id "$DEFAULT_VPC_ID" \
        --query 'GroupId' \
        --output text)
    
    echo "  ✓ RDS security group created: $RDS_SG_ID"
else
    echo "  ✓ RDS security group already exists: $RDS_SG_ID"
fi

# Add inbound rules to RDS security group
echo "  Configuring inbound rules..."

# Allow Lambda Security Group
aws_cmd ec2 authorize-security-group-ingress \
    --region "$REGION" \
    --group-id "$RDS_SG_ID" \
    --ip-permissions IpProtocol=tcp,FromPort=5432,ToPort=5432,UserIdGroupPairs=[{GroupId=$LAMBDA_SG_ID}] 2>/dev/null && echo "    ✓ Added Lambda security group rule" || echo "    - Lambda rule already exists"

# Allow Sigma IP 1
aws_cmd ec2 authorize-security-group-ingress \
    --region "$REGION" \
    --group-id "$RDS_SG_ID" \
    --ip-permissions IpProtocol=tcp,FromPort=5432,ToPort=5432,IpRanges=[{CidrIp=$SIGMA_IP_1,Description="Sigma BI Tool"}] 2>/dev/null && echo "    ✓ Added Sigma IP 1 ($SIGMA_IP_1)" || echo "    - Sigma IP 1 rule already exists"

# Allow Sigma IP 2
aws_cmd ec2 authorize-security-group-ingress \
    --region "$REGION" \
    --group-id "$RDS_SG_ID" \
    --ip-permissions IpProtocol=tcp,FromPort=5432,ToPort=5432,IpRanges=[{CidrIp=$SIGMA_IP_2,Description="Sigma BI Tool"}] 2>/dev/null && echo "    ✓ Added Sigma IP 2 ($SIGMA_IP_2)" || echo "    - Sigma IP 2 rule already exists"

echo ""

# Step 3: Create DB Subnet Group
echo "Step 3: Creating DB Subnet Group..."
SUBNET_GROUP_NAME="mobile-activity-db-subnet-group"

EXISTING_SUBNET_GROUP=$(aws_cmd rds describe-db-subnet-groups \
    --region "$REGION" \
    --db-subnet-group-name "$SUBNET_GROUP_NAME" \
    --query 'DBSubnetGroups[0].DBSubnetGroupName' \
    --output text 2>/dev/null || echo "")

if [ -z "$EXISTING_SUBNET_GROUP" ] || [ "$EXISTING_SUBNET_GROUP" = "None" ]; then
    echo "  Creating DB subnet group: $SUBNET_GROUP_NAME"
    aws_cmd rds create-db-subnet-group \
        --region "$REGION" \
        --db-subnet-group-name "$SUBNET_GROUP_NAME" \
        --db-subnet-group-description "Subnet group for mobile activity RDS PostgreSQL" \
        --subnet-ids $SUBNET_1 $SUBNET_2 \
        > /dev/null
    echo "  ✓ DB subnet group created"
else
    echo "  ✓ DB subnet group already exists"
fi
echo ""

# Step 4: Create RDS Instance
echo "Step 4: Creating RDS PostgreSQL Instance..."
EXISTING_DB=$(aws_cmd rds describe-db-instances \
    --region "$REGION" \
    --db-instance-identifier "$DB_INSTANCE_IDENTIFIER" \
    --query 'DBInstances[0].DBInstanceIdentifier' \
    --output text 2>/dev/null || echo "")

if [ -z "$EXISTING_DB" ] || [ "$EXISTING_DB" = "None" ]; then
    echo "  Creating RDS instance: $DB_INSTANCE_IDENTIFIER"
    echo "  This may take 5-10 minutes..."
    
    aws_cmd rds create-db-instance \
        --region "$REGION" \
        --db-instance-identifier "$DB_INSTANCE_IDENTIFIER" \
        --db-instance-class "$DB_INSTANCE_CLASS" \
        --engine "$DB_ENGINE" \
        --engine-version "$DB_ENGINE_VERSION" \
        --master-username "$DB_USERNAME" \
        --master-user-password "$DB_PASSWORD" \
        --allocated-storage "$STORAGE_SIZE" \
        --storage-type gp3 \
        --db-name "$DB_NAME" \
        --vpc-security-group-ids "$RDS_SG_ID" \
        --db-subnet-group-name "$SUBNET_GROUP_NAME" \
        --backup-retention-period 7 \
        --publicly-accessible \
        --no-multi-az \
        --storage-encrypted \
        > /dev/null
    
    echo "  ✓ RDS instance creation initiated"
    echo "  Waiting for instance to be available..."
    
    # Poll with status updates (max 20 minutes = 120 iterations of 10 seconds)
    for i in {1..120}; do
        STATUS=$(aws_cmd rds describe-db-instances \
            --region "$REGION" \
            --db-instance-identifier "$DB_INSTANCE_IDENTIFIER" \
            --query 'DBInstances[0].DBInstanceStatus' \
            --output text 2>/dev/null || echo "creating")
        
        if [ "$STATUS" = "available" ]; then
            echo "  ✓ RDS instance is now available"
            break
        fi
        
        if [ $((i % 6)) -eq 0 ]; then
            echo "    Status: $STATUS (${i}0 seconds elapsed)..."
        fi
        
        sleep 10
    done
    
    if [ "$STATUS" != "available" ]; then
        echo "  ⚠️  RDS instance still in status: $STATUS"
        echo "  It may still be creating. Check AWS Console for status."
    fi
else
    echo "  ✓ RDS instance already exists: $DB_INSTANCE_IDENTIFIER"
fi
echo ""

# Get RDS endpoint
echo "Step 5: Getting RDS endpoint..."
DB_ENDPOINT=$(aws_cmd rds describe-db-instances \
    --region "$REGION" \
    --db-instance-identifier "$DB_INSTANCE_IDENTIFIER" \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text)

DB_PORT=$(aws_cmd rds describe-db-instances \
    --region "$REGION" \
    --db-instance-identifier "$DB_INSTANCE_IDENTIFIER" \
    --query 'DBInstances[0].Endpoint.Port' \
    --output text)

echo "  ✓ RDS endpoint: $DB_ENDPOINT:$DB_PORT"
echo ""

# Step 6: Store credentials in Secrets Manager
echo "Step 6: Storing credentials in Secrets Manager..."
SECRET_JSON=$(cat <<EOF
{
  "host": "$DB_ENDPOINT",
  "port": $DB_PORT,
  "database": "$DB_NAME",
  "username": "$DB_USERNAME",
  "password": "$DB_PASSWORD",
  "ssl": true
}
EOF
)

EXISTING_SECRET=$(aws_cmd secretsmanager describe-secret \
    --region "$REGION" \
    --secret-id "$SECRET_NAME" \
    --query 'ARN' \
    --output text 2>/dev/null || echo "")

if [ -z "$EXISTING_SECRET" ] || [ "$EXISTING_SECRET" = "None" ]; then
    echo "  Creating secret: $SECRET_NAME"
    aws_cmd secretsmanager create-secret \
        --region "$REGION" \
        --name "$SECRET_NAME" \
        --description "PostgreSQL credentials for mobile activity logging" \
        --secret-string "$SECRET_JSON" \
        > /dev/null
    echo "  ✓ Secret created"
else
    echo "  Updating existing secret: $SECRET_NAME"
    aws_cmd secretsmanager update-secret \
        --region "$REGION" \
        --secret-id "$SECRET_NAME" \
        --secret-string "$SECRET_JSON" \
        > /dev/null
    echo "  ✓ Secret updated"
fi
echo ""

# Step 7: Create database schema
echo "Step 7: Creating database schema..."
echo "  Installing psql client (if needed)..."

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "  ⚠️  psql not found. Please install PostgreSQL client to create schema."
    echo "  Schema will need to be created manually using the following SQL:"
    echo ""
    echo "  CREATE TABLE user_activity ("
    echo "      activity_id VARCHAR(255) PRIMARY KEY,"
    echo "      user_id VARCHAR(255) NOT NULL,"
    echo "      email VARCHAR(255) NOT NULL,"
    echo "      event_type VARCHAR(100) NOT NULL,"
    echo "      timestamp BIGINT NOT NULL,"
    echo "      device_id VARCHAR(255),"
    echo "      ip_address VARCHAR(45),"
    echo "      metadata JSONB,"
    echo "      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    echo "  );"
    echo ""
    echo "  CREATE INDEX idx_user_activity_user_id_timestamp ON user_activity(user_id, timestamp DESC);"
    echo "  CREATE INDEX idx_user_activity_event_type ON user_activity(event_type);"
    echo "  CREATE INDEX idx_user_activity_email ON user_activity(email);"
    echo "  CREATE INDEX idx_user_activity_timestamp ON user_activity(timestamp DESC);"
    echo ""
else
    echo "  Creating schema via psql..."
    export PGPASSWORD="$DB_PASSWORD"
    
    psql -h "$DB_ENDPOINT" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" <<EOF 2>&1 || true
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

CREATE INDEX IF NOT EXISTS idx_user_activity_user_id_timestamp ON user_activity(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_event_type ON user_activity(event_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_email ON user_activity(email);
CREATE INDEX IF NOT EXISTS idx_user_activity_timestamp ON user_activity(timestamp DESC);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL DEFAULT 'basic',
    expiration_date BIGINT,
    is_deactivated BOOLEAN DEFAULT FALSE,
    deactivated_at BIGINT,
    last_active_at BIGINT,
    registration_method VARCHAR(50),
    phone_number VARCHAR(20),
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_expiration_date ON users(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_deactivated ON users(is_deactivated) WHERE is_deactivated = TRUE;

-- Approved emails table
CREATE TABLE IF NOT EXISTS approved_emails (
    email VARCHAR(255) PRIMARY KEY,
    role VARCHAR(50) NOT NULL DEFAULT 'basic',
    expiration_date BIGINT,
    registered_at BIGINT,
    approved_by VARCHAR(255),
    approved_at BIGINT,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_approved_emails_expiration_date ON approved_emails(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approved_emails_registered_at ON approved_emails(registered_at) WHERE registered_at IS NOT NULL;

-- Applets table
CREATE TABLE IF NOT EXISTS applets (
    user_id VARCHAR(255) NOT NULL,
    applet_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    embed_url TEXT NOT NULL,
    secret_name VARCHAR(255),
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, applet_id)
);

CREATE INDEX IF NOT EXISTS idx_applets_user_id_created_at ON applets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applets_user_id ON applets(user_id);
EOF
    
    echo "  ✓ Schema created"
fi
echo ""

echo "=========================================="
echo "✅ RDS PostgreSQL Setup Complete!"
echo "=========================================="
echo ""
echo "Database Details:"
echo "  Instance ID: $DB_INSTANCE_IDENTIFIER"
echo "  Endpoint: $DB_ENDPOINT:$DB_PORT"
echo "  Database: $DB_NAME"
echo "  Username: $DB_USERNAME"
echo "  Secret Name: $SECRET_NAME"
echo ""
echo "Security Groups:"
echo "  Lambda SG: $LAMBDA_SG_ID ($LAMBDA_SG_NAME)"
echo "  RDS SG: $RDS_SG_ID ($RDS_SG_NAME)"
echo ""
echo "Next Steps:"
echo "1. Update Lambda functions with VPC configuration"
echo "2. Update IAM roles with Secrets Manager permissions"
echo "3. Build and deploy Lambda functions"

