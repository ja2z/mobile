#!/bin/bash

# Migrate DynamoDB Tables to Postgres
# Exports data from DynamoDB and imports to Postgres

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
SECRET_NAME="mobile-app/postgres-credentials"

echo "=========================================="
echo "Migrating DynamoDB Tables to Postgres"
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

# Get Postgres credentials from Secrets Manager
echo "📋 Getting Postgres credentials..."
CREDENTIALS=$(aws_cmd secretsmanager get-secret-value \
    --secret-id "$SECRET_NAME" \
    --region "$REGION" \
    --query 'SecretString' \
    --output text)

DB_HOST=$(echo "$CREDENTIALS" | python3 -c "import sys, json; print(json.load(sys.stdin)['host'])")
DB_PORT=$(echo "$CREDENTIALS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('port', 5432))")
DB_NAME=$(echo "$CREDENTIALS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('database', 'mobile_app'))")
DB_USERNAME=$(echo "$CREDENTIALS" | python3 -c "import sys, json; print(json.load(sys.stdin)['username'])")
DB_PASSWORD=$(echo "$CREDENTIALS" | python3 -c "import sys, json; print(json.load(sys.stdin)['password'])")

echo "✓ Postgres credentials retrieved"
echo "  Host: $DB_HOST:$DB_PORT"
echo "  Database: $DB_NAME"
echo ""

# Export DynamoDB data
echo "📤 Exporting data from DynamoDB..."
echo ""

# Export users
echo "  Exporting mobile-users..."
aws_cmd dynamodb scan \
    --table-name mobile-users \
    --region "$REGION" \
    --output json > /tmp/users-export.json
USER_COUNT=$(cat /tmp/users-export.json | python3 -c "import sys, json; print(len(json.load(sys.stdin)['Items']))")
echo "  ✓ Exported $USER_COUNT users"

# Export approved emails
echo "  Exporting mobile-approved-emails..."
aws_cmd dynamodb scan \
    --table-name mobile-approved-emails \
    --region "$REGION" \
    --output json > /tmp/approved-emails-export.json
EMAIL_COUNT=$(cat /tmp/approved-emails-export.json | python3 -c "import sys, json; print(len(json.load(sys.stdin)['Items']))")
echo "  ✓ Exported $EMAIL_COUNT approved emails"

# Export applets
echo "  Exporting mobile-my-buys-applets..."
aws_cmd dynamodb scan \
    --table-name mobile-my-buys-applets \
    --region "$REGION" \
    --output json > /tmp/applets-export.json
APPLET_COUNT=$(cat /tmp/applets-export.json | python3 -c "import sys, json; print(len(json.load(sys.stdin)['Items']))")
echo "  ✓ Exported $APPLET_COUNT applets"
echo ""

# Convert and import to Postgres
echo "📥 Converting and importing to Postgres..."
export PGPASSWORD="$DB_PASSWORD"

# Convert DynamoDB JSON to SQL INSERT statements and import
python3 << PYTHON_SCRIPT
import json
import psycopg2
from psycopg2.extras import execute_values

# Connect to Postgres
conn = psycopg2.connect(
    host="$DB_HOST",
    port=$DB_PORT,
    database="$DB_NAME",
    user="$DB_USERNAME",
    password="$DB_PASSWORD",
    sslmode='require'
)
conn.autocommit = True
cur = conn.cursor()

# Helper function to convert DynamoDB item to dict
def dynamodb_to_dict(item):
    result = {}
    for key, value in item.items():
        if 'S' in value:
            result[key] = value['S']
        elif 'N' in value:
            result[key] = int(value['N'])
        elif 'BOOL' in value:
            result[key] = value['BOOL']
        elif 'NULL' in value:
            result[key] = None
        elif 'M' in value:
            result[key] = json.dumps({k: dynamodb_to_dict({k: v})[k] for k, v in value['M'].items()})
    return result

# Import users
print("  Importing users...")
with open('/tmp/users-export.json', 'r') as f:
    data = json.load(f)
    users = []
    for item in data.get('Items', []):
        user = dynamodb_to_dict(item)
        users.append((
            user.get('userId'),
            user.get('email'),
            user.get('role', 'basic'),
            user.get('expirationDate'),
            user.get('isDeactivated', False),
            user.get('deactivatedAt'),
            user.get('lastActiveAt'),
            user.get('registrationMethod'),
            user.get('phoneNumber'),
            user.get('createdAt'),
            user.get('updatedAt')
        ))
    
    if users:
        execute_values(
            cur,
            """INSERT INTO users (user_id, email, role, expiration_date, is_deactivated, 
                deactivated_at, last_active_at, registration_method, phone_number, created_at, updated_at)
                VALUES %s
                ON CONFLICT (user_id) DO UPDATE SET
                    email = EXCLUDED.email,
                    role = EXCLUDED.role,
                    expiration_date = EXCLUDED.expiration_date,
                    is_deactivated = EXCLUDED.is_deactivated,
                    deactivated_at = EXCLUDED.deactivated_at,
                    last_active_at = EXCLUDED.last_active_at,
                    registration_method = EXCLUDED.registration_method,
                    phone_number = EXCLUDED.phone_number,
                    updated_at = EXCLUDED.updated_at""",
            users
        )
        print(f"  ✓ Imported {len(users)} users")
    else:
        print("  ✓ No users to import")

# Import approved emails
print("  Importing approved emails...")
with open('/tmp/approved-emails-export.json', 'r') as f:
    data = json.load(f)
    emails = []
    for item in data.get('Items', []):
        email = dynamodb_to_dict(item)
        metadata = None
        if 'metadata' in email and email['metadata']:
            if isinstance(email['metadata'], str):
                metadata = email['metadata']
            else:
                metadata = json.dumps(email['metadata'])
        
        emails.append((
            email.get('email'),
            email.get('role', 'basic'),
            email.get('expirationDate'),
            email.get('registeredAt'),
            email.get('approvedBy'),
            email.get('approvedAt'),
            metadata
        ))
    
    if emails:
        execute_values(
            cur,
            """INSERT INTO approved_emails (email, role, expiration_date, registered_at, 
                approved_by, approved_at, metadata)
                VALUES %s
                ON CONFLICT (email) DO UPDATE SET
                    role = EXCLUDED.role,
                    expiration_date = EXCLUDED.expiration_date,
                    registered_at = EXCLUDED.registered_at,
                    approved_by = EXCLUDED.approved_by,
                    approved_at = EXCLUDED.approved_at,
                    metadata = EXCLUDED.metadata""",
            emails
        )
        print(f"  ✓ Imported {len(emails)} approved emails")
    else:
        print("  ✓ No approved emails to import")

# Import applets
print("  Importing applets...")
with open('/tmp/applets-export.json', 'r') as f:
    data = json.load(f)
    applets = []
    for item in data.get('Items', []):
        applet = dynamodb_to_dict(item)
        applets.append((
            applet.get('userId'),
            applet.get('appletId'),
            applet.get('name'),
            applet.get('embedUrl'),
            applet.get('secretName'),
            applet.get('createdAt'),
            applet.get('updatedAt')
        ))
    
    if applets:
        execute_values(
            cur,
            """INSERT INTO applets (user_id, applet_id, name, embed_url, secret_name, created_at, updated_at)
                VALUES %s
                ON CONFLICT (user_id, applet_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    embed_url = EXCLUDED.embed_url,
                    secret_name = EXCLUDED.secret_name,
                    updated_at = EXCLUDED.updated_at""",
            applets
        )
        print(f"  ✓ Imported {len(applets)} applets")
    else:
        print("  ✓ No applets to import")

cur.close()
conn.close()
PYTHON_SCRIPT

echo ""

# Verify counts
echo "🔍 Verifying data integrity..."
export PGPASSWORD="$DB_PASSWORD"

PG_USER_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM users;" | tr -d ' ')
PG_EMAIL_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM approved_emails;" | tr -d ' ')
PG_APPLET_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM applets;" | tr -d ' ')

echo "  Users: DynamoDB=$USER_COUNT, Postgres=$PG_USER_COUNT"
echo "  Approved Emails: DynamoDB=$EMAIL_COUNT, Postgres=$PG_EMAIL_COUNT"
echo "  Applets: DynamoDB=$APPLET_COUNT, Postgres=$PG_APPLET_COUNT"
echo ""

if [ "$USER_COUNT" = "$PG_USER_COUNT" ] && [ "$EMAIL_COUNT" = "$PG_EMAIL_COUNT" ] && [ "$APPLET_COUNT" = "$PG_APPLET_COUNT" ]; then
    echo "✅ Migration successful! All counts match."
else
    echo "⚠️  Warning: Counts don't match. Please verify manually."
fi

echo ""
echo "💡 Cleanup temporary files:"
echo "   rm /tmp/users-export.json /tmp/approved-emails-export.json /tmp/applets-export.json"


