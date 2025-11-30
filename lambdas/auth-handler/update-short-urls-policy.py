#!/usr/bin/env python3
import json
import sys
import subprocess
import os

# Set environment variables
os.environ['AWS_PROFILE'] = 'saml'
os.environ['AWS_CA_BUNDLE'] = ''
os.environ['PYTHONHTTPSVERIFY'] = '0'

# Get the current policy
print("🔍 Getting current IAM policy...")
result = subprocess.run(
    ['aws', 'iam', 'get-role-policy', '--role-name', 'mobile-auth-lambda-role', 
     '--policy-name', 'mobile-auth-lambda-policy', '--no-verify-ssl', '--region', 'us-west-2'],
    capture_output=True,
    text=True
)

if result.returncode != 0:
    print(f"❌ Error: Failed to get IAM policy: {result.stderr}", file=sys.stderr)
    sys.exit(1)

# Parse JSON, ignoring warnings - find the JSON object
output_lines = result.stdout.split('\n')
json_start = -1
json_end = -1
for i, line in enumerate(output_lines):
    if line.strip().startswith('{') and json_start == -1:
        json_start = i
    if json_start != -1 and line.strip() == '}':
        json_end = i
        break

if json_start == -1 or json_end == -1:
    print("❌ Error: Could not find JSON in output", file=sys.stderr)
    sys.exit(1)

json_lines = output_lines[json_start:json_end+1]
json_str = '\n'.join(json_lines)
try:
    data = json.loads(json_str)
except json.JSONDecodeError as e:
    print(f"❌ Error parsing JSON: {e}", file=sys.stderr)
    print(f"JSON string: {json_str[:500]}", file=sys.stderr)
    sys.exit(1)

policy_doc = data.get('PolicyDocument', {})

# Find the DynamoDB statement
print("📝 Updating policy to include mobile-short-urls table...")
found = False
for statement in policy_doc.get('Statement', []):
    actions = statement.get('Action', [])
    if isinstance(actions, str):
        actions = [actions]
    
    # Check if this is a DynamoDB statement
    if any('dynamodb' in str(action).lower() for action in actions):
        found = True
        resources = statement.get('Resource', [])
        if isinstance(resources, str):
            resources = [resources]
        
        short_urls_arn = "arn:aws:dynamodb:*:*:table/mobile-short-urls"
        
        if short_urls_arn not in resources:
            resources.append(short_urls_arn)
            statement['Resource'] = resources
            print("✓ Added mobile-short-urls table to IAM policy")
        else:
            print("✓ mobile-short-urls table already in IAM policy")
        break

if not found:
    print("⚠️  Warning: No DynamoDB statement found in policy, creating new one", file=sys.stderr)
    new_statement = {
        "Effect": "Allow",
        "Action": [
            "dynamodb:GetItem",
            "dynamodb:PutItem",
            "dynamodb:UpdateItem",
            "dynamodb:DeleteItem",
            "dynamodb:Query"
        ],
        "Resource": [
            "arn:aws:dynamodb:*:*:table/mobile-short-urls"
        ]
    }
    policy_doc['Statement'].append(new_statement)
    print("✓ Created new DynamoDB statement with mobile-short-urls table")

# Update the policy
print("🚀 Updating IAM policy...")
policy_json = json.dumps(policy_doc)

update_result = subprocess.run(
    ['aws', 'iam', 'put-role-policy', '--role-name', 'mobile-auth-lambda-role',
     '--policy-name', 'mobile-auth-lambda-policy', '--policy-document', policy_json,
     '--no-verify-ssl', '--region', 'us-west-2'],
    capture_output=True,
    text=True
)

if update_result.returncode != 0:
    print(f"❌ Error updating policy: {update_result.stderr}", file=sys.stderr)
    sys.exit(1)

print("")
print("✅ IAM policy updated successfully!")
print("   The Lambda can now read/write to the mobile-short-urls DynamoDB table.")

