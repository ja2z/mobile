# SES Email Spam Issue Diagnosis

## Date: December 27, 2025

## Problem
Emails sent to sign in to Big Buys Mobile are going to spam in Gmail, even though:
- ✅ SPF, DKIM, DMARC all pass
- ✅ Email format is correct
- ✅ FROM address is correct (`hello@bigbuys.io`)

This started happening after moving Lambda functions into a VPC.

## Diagnostic Results

### ✅ Configuration Status
- **SES Account**: Enabled, out of sandbox
- **Domain Verification**: ✅ `bigbuys.io` is verified (covers `hello@bigbuys.io`)
- **NAT Gateway**: ✅ Available (IP: 54.213.75.202)
- **Configuration Sets**: None (using default SES behavior)

### 📊 Sending Statistics
- Very low sending volume (only ~5 emails in last 2 weeks)
- No bounces, complaints, or rejects detected
- All authentication (SPF/DKIM/DMARC) passes

## Root Cause Analysis

### Why Emails Are Going to Spam

1. **IP Reputation Change**
   - After VPC migration, Lambda connections to SES now go through NAT Gateway
   - SES may be routing emails through different IP pools
   - Different SES IPs may have different reputation scores
   - The spam email came from `54.240.27.192`, while the working email came from `54.240.27.45`

2. **Low Sending Volume**
   - Only ~5 emails sent in the last 2 weeks
   - Gmail's algorithms are more suspicious of low-volume senders
   - Sudden change in sending pattern (after VPC migration) can trigger spam filters

3. **User-Level Reputation**
   - Gmail learns from user actions (marking spam/not spam)
   - New recipients haven't trained Gmail that these emails are legitimate
   - Even with perfect authentication, user-level filters can still flag emails

## Solutions

### Immediate Actions (Quick Fixes)

1. **Have Recipients Mark as "Not Spam"**
   - This trains Gmail's filters for each recipient
   - Most effective for individual accounts
   - Recipients should:
     - Open Spam folder
     - Find email from `hello@bigbuys.io`
     - Click "Not spam" button
     - Optionally add sender to contacts

2. **Create Gmail Filters** (For frequent recipients)
   - Go to Gmail Settings → Filters and Blocked Addresses
   - Create filter for `hello@bigbuys.io`
   - Check "Never send it to Spam"
   - This bypasses spam filtering permanently

### Medium-Term Solutions

3. **Gradually Increase Sending Volume**
   - Warm up the sending pattern over a few days
   - Start with a few test emails to trusted addresses
   - Gradually increase volume
   - This helps Gmail adjust to the new sending pattern

4. **Monitor Google Postmaster Tools**
   - Check domain/IP reputation scores
   - Monitor spam rate (should be < 0.1%)
   - Watch for any reputation drops
   - URL: https://postmaster.google.com/

### Long-Term Solutions

5. **Use SES Configuration Sets**
   - Create a configuration set for better reputation control
   - Can track bounces/complaints more effectively
   - Allows for dedicated IP pools (if needed)
   - Provides better sending analytics

6. **Consider Dedicated IPs** (If volume increases)
   - For high-volume sending, dedicated IPs provide better control
   - Requires IP warm-up process
   - Only needed if sending > 100k emails/month

## Technical Details

### Email Headers Comparison

**Working Email (Dec 23):**
- Source IP: `54.240.27.45`
- All authentication passes
- Delivered to inbox

**Spam Email (Dec 27):**
- Source IP: `54.240.27.192`
- All authentication passes
- Delivered to spam

**Key Difference**: Different SES source IPs, suggesting SES is using different IP pools after VPC migration.

### Network Architecture

```
Lambda (VPC) → NAT Gateway (54.213.75.202) → Internet Gateway → AWS SES
                                                                    ↓
                                                          SES uses its own IPs
                                                          (54.240.27.x range)
```

The NAT Gateway IP is only used for Lambda→SES API calls. SES uses its own IP pool for actual email delivery.

## Verification Commands

Run the diagnostic script to check current status:

```bash
./scripts/check-ses-reputation.sh
```

## Expected Timeline

- **Immediate**: Recipients mark as "Not Spam" → Works for those accounts
- **1-2 days**: Gmail learns from user actions → Improves for frequent recipients
- **1 week**: Sending pattern stabilizes → Gmail adjusts to new pattern
- **2-4 weeks**: Full reputation recovery → Emails consistently land in inbox

## Prevention

To prevent future spam issues:

1. ✅ Keep SPF/DKIM/DMARC configured correctly
2. ✅ Use consistent FROM address (`hello@bigbuys.io`)
3. ✅ Maintain good sending practices (don't send too frequently)
4. ✅ Monitor Google Postmaster Tools for reputation issues
5. ✅ Have users mark emails as "Not Spam" if they go to spam
6. ✅ Consider using SES Configuration Sets for better tracking

## Notes

- The VPC migration itself didn't break anything - all authentication still works
- The issue is likely Gmail's algorithms being cautious about the new sending pattern
- This is a common issue when network architecture changes
- With proper warm-up and user training, reputation should recover within 1-2 weeks

