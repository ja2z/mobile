# Gmail Spam Fix Guide

## Problem
Emails from `hello@bigbuys.io` are going to spam in Gmail, even though:
- ✅ SPF, DKIM, DMARC all pass
- ✅ Email format matches working version
- ✅ FROM_EMAIL and FROM_NAME are correctly configured

## Gmail-Specific Fixes

### 1. Mark as "Not Spam" (Most Common Fix)
This trains Gmail's filters for your account:

1. Open Gmail
2. Go to **Spam** folder
3. Find email from `hello@bigbuys.io`
4. Click **"Not spam"** button
5. This tells Gmail this sender is legitimate

**Why this works:** Gmail learns from your actions. Marking emails as "Not spam" trains the filter for your specific account.

### 2. Add Sender to Contacts
Improves sender reputation:

1. Open email from `hello@bigbuys.io`
2. Click on sender name **"Big Buys"**
3. Click **"Add to contacts"**
4. Gmail will prioritize emails from contacts

### 3. Create Gmail Filter (Prevents Future Spam Filtering)
Most reliable long-term fix:

1. Go to **Gmail Settings** (gear icon → See all settings)
2. Click **"Filters and Blocked Addresses"** tab
3. Click **"Create a new filter"**
4. In **"From"** field, enter: `hello@bigbuys.io`
5. Click **"Create filter"**
6. Check **"Never send it to Spam"**
7. Optionally check **"Always mark it as important"**
8. Click **"Create filter"**

**Result:** All future emails from `hello@bigbuys.io` will bypass spam filtering.

### 4. Google Postmaster Tools (Domain-Level Reputation)
Check domain reputation at Google level:

1. Go to https://postmaster.google.com/
2. Sign in with Google account
3. Click **"Add a property"**
4. Add domain: `bigbuys.io`
5. Verify domain ownership (add DNS TXT record)
6. Check **"Reputation"** tab for domain/IP reputation scores

**What to look for:**
- **Spam Rate**: Should be < 0.1%
- **IP Reputation**: Should be "Good" or "Medium"
- **Domain Reputation**: Should be "Good" or "Medium"

### 5. Check Email Headers
Verify emails are being sent correctly:

1. Open email in Gmail
2. Click **three dots** (⋮) → **"Show original"**
3. Check for:
   - `SPF: PASS`
   - `DKIM: PASS`
   - `DMARC: PASS`
   - `Return-Path: bounce.bigbuys.io`

## Why This Happens

Even with perfect SPF/DKIM/DMARC, Gmail can still filter emails to spam due to:

1. **User-level reputation**: Gmail learns from your actions (marking spam/not spam)
2. **Domain reputation**: If domain was recently used for spam, reputation needs rebuilding
3. **IP reputation**: AWS SES IPs are shared, so reputation depends on other senders
4. **Content analysis**: Gmail analyzes email content for spam signals
5. **Engagement**: Low open/click rates can trigger spam filtering

## Most Likely Fix

Based on your description ("I had to do something on Google"), you likely:

1. **Created a Gmail filter** (most common and permanent fix)
2. **Marked emails as "Not spam"** (trains Gmail for your account)
3. **Added sender to contacts** (improves reputation)

**Recommendation:** Try all three, but the Gmail filter (#3) is the most reliable long-term solution.

## Verification

After applying fixes, verify:

1. Send test email
2. Check if it arrives in inbox (not spam)
3. If still in spam, mark as "Not spam" again
4. Gmail should learn after 2-3 emails

## Prevention

To prevent future spam issues:

1. ✅ Keep SPF/DKIM/DMARC configured correctly
2. ✅ Use consistent FROM address (`hello@bigbuys.io`)
3. ✅ Maintain good sending practices (don't send too frequently)
4. ✅ Monitor Google Postmaster Tools for reputation issues
5. ✅ Have users mark emails as "Not spam" if they go to spam

