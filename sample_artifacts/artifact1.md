# DynamoDB Schema Design

## Table 1: `mobile-auth-tokens`

**Purpose:** Store magic link tokens and active user sessions

### Primary Structure
- **Partition Key:** `tokenId` (String) - Unique token identifier
- **Sort Key:** None
- **TTL Attribute:** `expiresAt` (Number) - Unix timestamp for automatic cleanup

### Attributes
```javascript
{
  tokenId: "tok_abc123xyz",           // Partition key - unique token ID
  tokenType: "magic_link",            // "magic_link" | "session"
  email: "user@sigmacomputing.com",   // User's email
  phoneNumber: "+14155551234",        // Optional - for SMS flow
  userId: "usr_123",                  // Generated user ID
  deviceId: "dev_xyz789",             // Device identifier for session binding
  createdAt: 1698765432,              // Unix timestamp
  expiresAt: 1698769032,              // Unix timestamp - TTL attribute
  used: false,                        // For magic links - one-time use
  usedAt: null,                       // Timestamp when token was used
  sessionJWT: "eyJhbGc...",           // For session tokens - the actual JWT
  metadata: {
    sourceFlow: "email",              // "email" | "sms"
    dashboardId: "db_123",            // Optional - for deep linking
    ipAddress: "192.168.1.1",
    userAgent: "MobileDashboard/1.0"
  }
}
```

### Global Secondary Index 1: `email-index`
- **Partition Key:** `email` (String)
- **Sort Key:** `createdAt` (Number)
- **Purpose:** Look up all tokens/sessions for a user
- **Projection:** ALL

### Global Secondary Index 2: `userId-tokenType-index`
- **Partition Key:** `userId` (String)
- **Sort Key:** `tokenType` (String)
- **Purpose:** Find active sessions for a user
- **Projection:** ALL

### Sample Data Entries

**Magic Link Token (Email Flow):**
```json
{
  "tokenId": "tok_ml_a1b2c3d4e5f6",
  "tokenType": "magic_link",
  "email": "demo@sigmacomputing.com",
  "userId": "usr_demo_123",
  "deviceId": null,
  "createdAt": 1698765432,
  "expiresAt": 1698766332,
  "used": false,
  "usedAt": null,
  "sessionJWT": null,
  "metadata": {
    "sourceFlow": "email",
    "ipAddress": "10.0.1.5",
    "userAgent": "MobileDashboard/1.0"
  }
}
```

**Magic Link Token (SMS Flow with Deep Link):**
```json
{
  "tokenId": "tok_ml_x9y8z7w6v5u4",
  "tokenType": "magic_link",
  "email": "customer@example.com",
  "phoneNumber": "+14155551234",
  "userId": "usr_customer_456",
  "deviceId": null,
  "createdAt": 1698765432,
  "expiresAt": 1698766332,
  "used": false,
  "usedAt": null,
  "sessionJWT": null,
  "metadata": {
    "sourceFlow": "sms",
    "dashboardId": "workbook_abc123",
    "ipAddress": "10.0.2.15",
    "userAgent": "MobileDashboard/1.0"
  }
}
```

**Active Session Token:**
```json
{
  "tokenId": "ses_p9o8i7u6y5t4",
  "tokenType": "session",
  "email": "demo@sigmacomputing.com",
  "userId": "usr_demo_123",
  "deviceId": "dev_iphone_abc",
  "createdAt": 1698765432,
  "expiresAt": 1700788232,
  "used": true,
  "usedAt": 1698765432,
  "sessionJWT": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "metadata": {
    "sourceFlow": "email",
    "lastUsedAt": 1698875432,
    "ipAddress": "10.0.1.5",
    "userAgent": "MobileDashboard/1.0"
  }
}
```

---

## Table 2: `mobile-approved-emails`

**Purpose:** Whitelist of approved non-Sigma emails for registration

### Primary Structure
- **Partition Key:** `email` (String) - Email address
- **Sort Key:** None

### Attributes
```javascript
{
  email: "customer@example.com",      // Partition key
  approvedBy: "admin@sigmacomputing.com",
  approvedAt: 1698765432,             // Unix timestamp
  expiresAt: null,                    // Optional - for temporary access
  metadata: {
    company: "Example Corp",
    reason: "Q4 2024 Demo",
    notes: "Approved for sales demo"
  }
}
```

### Sample Data Entries

```json
[
  {
    "email": "john.doe@acmecorp.com",
    "approvedBy": "sales@sigmacomputing.com",
    "approvedAt": 1698765432,
    "expiresAt": null,
    "metadata": {
      "company": "Acme Corp",
      "reason": "Enterprise trial",
      "notes": "VP of Analytics - approved indefinitely"
    }
  },
  {
    "email": "jane.smith@startupxyz.com",
    "approvedBy": "demo@sigmacomputing.com",
    "approvedAt": 1698765432,
    "expiresAt": 1701357432,
    "metadata": {
      "company": "Startup XYZ",
      "reason": "Conference demo",
      "notes": "30-day access for Q4 conference"
    }
  }
]
```

---

## Access Patterns Covered

### Pattern 1: Validate Magic Link Token
**Query:** Get by `tokenId`
**Use:** User clicks magic link, app needs to verify token
```
GetItem on mobile-auth-tokens where tokenId = "tok_ml_xxx"
```

### Pattern 2: Check Email Approval Status
**Query:** Get by `email`
**Use:** User enters email, need to check if approved
```
GetItem on mobile-approved-emails where email = "user@example.com"
```

### Pattern 3: Find User's Active Sessions
**Query:** Query GSI `userId-tokenType-index`
**Use:** Check if user already has active session, or revoke all sessions
```
Query userId-tokenType-index where userId = "usr_123" AND tokenType = "session"
```

### Pattern 4: Find User's Recent Activity
**Query:** Query GSI `email-index`
**Use:** Audit log, debug issues
```
Query email-index where email = "user@example.com" ORDER BY createdAt DESC
```

### Pattern 5: Cleanup Expired Tokens
**Auto:** DynamoDB TTL on `expiresAt`
**Use:** Automatically remove expired tokens and sessions

---

## Table Creation Cost Estimates

- **mobile-auth-tokens:** 
  - On-Demand pricing recommended for variable load
  - Estimated: $1-5/month for internal demo tool
  
- **mobile-approved-emails:**
  - Minimal writes, mostly reads
  - Estimated: <$1/month

---

## Capacity Planning

### mobile-auth-tokens
- **Read:** 5 RCU (on-demand)
- **Write:** 5 WCU (on-demand)
- **Expected Volume:** 100-500 authentications/day
- **Storage:** Minimal (tokens auto-expire via TTL)

### mobile-approved-emails
- **Read:** 1 RCU (on-demand)
- **Write:** 1 WCU (on-demand)
- **Expected Volume:** <10 writes/week, <100 reads/day
- **Storage:** <1 MB