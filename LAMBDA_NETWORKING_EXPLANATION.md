# Lambda VPC Networking Explanation

## The Problem We're Solving

When Lambda functions are placed in a VPC (to access private resources like RDS PostgreSQL), they **lose default internet access**. This is because:

1. Lambda functions in VPC get private IP addresses only
2. Private IPs can't directly reach the internet
3. They need a NAT Gateway to translate private → public traffic

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VPC: vpc-6144d219                        │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Internet Gateway (igw-509d6629)              │  │
│  │              ↕ Public Internet Access                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↕                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Public Subnet: subnet-b94c40f2 (us-west-2a)     │  │
│  │                                                          │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │     NAT Gateway: nat-01e3ffe9cc512d1df          │  │  │
│  │  │     (with Elastic IP: eipalloc-07f303af9ea2b01f7)│  │  │
│  │  │     ↕ Translates private IPs → public IP         │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                          │  │
│  │  Route Table: rtb-e8780b93                             │  │
│  │    • 0.0.0.0/0 → NAT Gateway (for Lambda traffic)      │  │
│  │    • 172.31.0.0/16 → local (VPC internal)              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↕                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Public Subnet: subnet-d6e605ae (us-west-2b)       │  │
│  │                                                          │  │
│  │  Route Table: rtb-0cfe79f929a6b41a4                     │  │
│  │    • 0.0.0.0/0 → NAT Gateway                            │  │
│  │    • 172.31.0.0/16 → local (VPC internal)               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↕                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Lambda Function: mobile-auth-handler             │  │
│  │                                                          │  │
│  │  • Deployed in BOTH subnets (for high availability)   │  │
│  │  • Security Group: sg-039167944cbfce1b3                  │  │
│  │    - Outbound: All traffic (0.0.0.0/0)                  │  │
│  │    - Outbound: HTTPS (443) to 0.0.0.0/0                │  │
│  │    - Outbound: PostgreSQL (5432)                       │  │
│  │                                                          │  │
│  │  Traffic Flow:                                          │  │
│  │    1. Lambda → Route Table → NAT Gateway               │  │
│  │    2. NAT Gateway → Internet Gateway → Internet        │  │
│  │    3. Response: Internet → IGW → NAT → Lambda          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↕                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         RDS PostgreSQL (Private)                        │  │
│  │         • Accessible via VPC internal routing           │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### 1. **Internet Gateway (IGW)**
- **Purpose**: Provides public internet access for resources in public subnets
- **How it works**: Routes traffic between your VPC and the internet
- **Location**: Attached to the VPC at the top level
- **Note**: Lambda functions CANNOT use IGW directly (they don't get public IPs)

### 2. **NAT Gateway**
- **Purpose**: Allows private resources (like Lambda) to access the internet
- **Requirements**:
  - Must be in a **public subnet** (so it can reach the Internet Gateway)
  - Must have an **Elastic IP** (static public IP address)
  - Acts as a "translator" between private and public IPs
- **How it works**:
  1. Lambda sends request with private IP
  2. Route table sends it to NAT Gateway
  3. NAT Gateway translates to its public Elastic IP
  4. NAT Gateway forwards to Internet Gateway
  5. Internet Gateway sends to internet
  6. Response comes back through the same path

### 3. **Route Tables**
- **Purpose**: Define where traffic should go based on destination
- **Key Routes**:
  - `0.0.0.0/0` (all internet traffic) → NAT Gateway
  - `172.31.0.0/16` (VPC internal) → local (stays in VPC)
- **Critical**: Each subnet needs a route table that routes `0.0.0.0/0` to the NAT Gateway

### 4. **Lambda in VPC**
- **Why**: To access private resources like RDS PostgreSQL
- **Trade-off**: Loses default internet access
- **Solution**: Route all internet traffic through NAT Gateway
- **ENIs**: AWS creates Elastic Network Interfaces (ENIs) for Lambda in your subnets

## The Bug We Fixed

### Original Problem
The NAT Gateway (`nat-0428aeb8d510e987f`) was created **without an Elastic IP**. This meant:
- NAT Gateway couldn't reach the internet (no public IP)
- Lambda → NAT Gateway → ??? (nowhere to go)
- Result: Timeout when trying to reach AWS SES

### The Fix
1. ✅ Allocated Elastic IP: `eipalloc-07f303af9ea2b01f7`
2. ✅ Deleted old NAT Gateway (without Elastic IP)
3. ✅ Created new NAT Gateway (`nat-01e3ffe9cc512d1df`) with Elastic IP
4. ⏳ Waiting for NAT Gateway to become `available` (2-5 minutes)
5. ⏳ Will update route tables to point to new NAT Gateway

## Traffic Flow Example: Sending Email via SES

```
1. User clicks "Continue" button
   ↓
2. Mobile app → API Gateway → Lambda function
   ↓
3. Lambda function needs to send email via AWS SES
   ↓
4. Lambda (private IP: 172.31.x.x) sends HTTPS request
   ↓
5. Route Table checks: "Where does 0.0.0.0/0 go?"
   Answer: NAT Gateway (nat-01e3ffe9cc512d1df)
   ↓
6. NAT Gateway receives request
   - Translates source IP: 172.31.x.x → Elastic IP (public)
   - Forwards to Internet Gateway
   ↓
7. Internet Gateway sends to AWS SES (public internet)
   ↓
8. SES responds → Internet Gateway → NAT Gateway → Lambda
   ↓
9. Email sent! ✅
```

## Why This Setup?

### Lambda Needs VPC Access For:
- ✅ **PostgreSQL RDS**: Database is in private subnet, Lambda needs VPC access
- ✅ **Secrets Manager**: Can use VPC endpoints (we have KMS endpoint)
- ✅ **Other VPC resources**: Any private AWS resources

### Lambda Needs Internet Access For:
- ✅ **AWS SES**: Email service (no VPC endpoint available)
- ✅ **Other AWS APIs**: Some services don't have VPC endpoints
- ✅ **External APIs**: Third-party services

### The Solution:
- Lambda in VPC (for RDS access)
- Route internet traffic through NAT Gateway (for SES/external APIs)
- NAT Gateway in public subnet with Elastic IP (for internet access)

## Current Status

- ✅ Route tables configured correctly
- ✅ Security groups allow outbound HTTPS
- ✅ NAT Gateway created with Elastic IP
- ⏳ Waiting for NAT Gateway to become `available`
- ⏳ Route tables need to point to new NAT Gateway ID

Once the NAT Gateway is available, the login flow should work!

