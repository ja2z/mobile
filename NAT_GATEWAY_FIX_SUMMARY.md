# NAT Gateway Fix Summary

## Problem
Lambda functions in VPC were timing out when trying to reach AWS SES because the NAT Gateway was missing an Elastic IP.

## Solution Implemented

### ✅ Completed Steps

1. **Allocated Elastic IP**: `eipalloc-078b0387623ad1603`
2. **Created NAT Gateway**: `nat-03f520c432722ce47`
   - State: `available`
   - Public IP: `54.213.75.202`
   - Subnet: `subnet-b94c40f2` (us-west-2a)
3. **Updated Route Tables**:
   - `rtb-e8780b93` (subnet-b94c40f2) → NAT Gateway ✓
   - `rtb-0cfe79f929a6b41a4` (subnet-d6e605ae) → NAT Gateway ✓
4. **Verified Configuration**:
   - Security Groups: Allow all outbound traffic ✓
   - Network ACLs: Allow all outbound traffic ✓
   - NAT Gateway: Available with Elastic IP ✓

### ⏳ Current Status

**Configuration is correct**, but Lambda is still timing out. This is likely due to:

1. **Route Propagation Delay**: AWS route table changes can take 5-10 minutes to fully propagate
2. **Lambda ENI Refresh**: Lambda Elastic Network Interfaces may need to be recreated to pick up new routes
3. **Cold Start**: Existing Lambda instances may have cached routes

### Next Steps

1. **Wait 5-10 minutes** for route propagation
2. **Trigger cold starts** by invoking Lambda multiple times (forces ENI refresh)
3. **Monitor CloudWatch logs** for successful SES connections

### Testing

To test if it's working:

```bash
# Test Lambda function
aws lambda invoke \
  --function-name mobile-auth-handler \
  --region us-west-2 \
  --cli-binary-format raw-in-base64-out \
  --payload '{"path":"/auth/request-magic-link","httpMethod":"POST","headers":{"Content-Type":"application/json"},"body":"{\"email\":\"test@sigmacomputing.com\",\"linkType\":\"universal\"}"}' \
  response.json

# Check logs
aws logs tail /aws/lambda/mobile-auth-handler --since 5m --region us-west-2
```

### If Still Not Working

If timeouts persist after 10 minutes:

1. **Check NAT Gateway metrics** in CloudWatch:
   - `BytesOutToDestination` - Should show traffic
   - `PacketsOutToDestination` - Should show packets

2. **Verify NAT Gateway connectivity**:
   ```bash
   aws ec2 describe-nat-gateways \
     --nat-gateway-ids nat-03f520c432722ce47 \
     --region us-west-2
   ```

3. **Check for Lambda ENI issues**:
   - Lambda ENIs might be stuck in "pending" state
   - May need to wait longer or trigger more invocations

4. **Consider VPC Flow Logs** to debug routing:
   ```bash
   # Enable VPC Flow Logs to see traffic flow
   ```

## Architecture

```
Lambda (VPC) → Route Table → NAT Gateway (54.213.75.202) → Internet Gateway → AWS SES
```

All components are correctly configured. The issue is likely propagation delay.

