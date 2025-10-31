# Desktop Backend Integration Guide

Guide for integrating the "Send to Mobile" feature into your existing desktop Big Buys application.

---

## Overview

The desktop app already has Okta authentication. When a user clicks "Send to Mobile", the desktop backend should:
1. Validate the user is authenticated (via Okta)
2. Call the mobile auth Lambda with the API key
3. Send SMS magic link to user's phone
4. Optionally pass the current dashboard ID for deep linking

---

## Prerequisites

1. **API Key** - Retrieved during AWS setup (Artifact 3, Step 2)
2. **API Endpoint** - Your deployed API Gateway URL
3. **User phone number** - Collected from user in desktop UI

---

## Step 1: Store API Key Securely

### Option A: Environment Variable (Development)

```bash
# .env file
MOBILE_AUTH_API_KEY=sk_live_abc123xyz456789
MOBILE_AUTH_API_URL=https://abc123.execute-api.us-west-2.amazonaws.com/v1/auth
```

### Option B: AWS Secrets Manager (Production)

```javascript
// Node.js backend example
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const client = new SecretsManagerClient({ region: 'us-west-2' });

async function getMobileApiKey() {
  const command = new GetSecretValueCommand({
    SecretId: 'desktop-app/mobile-api-key'
  });
  
  const response = await client.send(command);
  return response.SecretString;
}
```

### Option C: Configuration Service

```javascript
// config.js
module.exports = {
  mobileAuth: {
    apiKey: process.env.MOBILE_AUTH_API_KEY,
    apiUrl: process.env.MOBILE_AUTH_API_URL || 'https://abc123.execute-api.us-west-2.amazonaws.com/v1/auth'
  }
};
```

---

## Step 2: Backend API Implementation

### Node.js/Express Example

```javascript
// routes/mobile.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const config = require('../config');

/**
 * Send to Mobile endpoint
 * Called from desktop app frontend
 */
router.post('/send-to-mobile', async (req, res) => {
  try {
    // 1. Verify user is authenticated (Okta session)
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        error: 'Not authenticated',
        message: 'User must be logged in to send to mobile'
      });
    }

    // 2. Extract request data
    const { phoneNumber, dashboardId } = req.body;

    // 3. Validate phone number format (E.164)
    if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
      return res.status(400).json({
        error: 'Invalid phone number',
        message: 'Please provide a valid phone number in E.164 format (e.g., +14155551234)'
      });
    }

    // 4. Get user email from Okta session
    const userEmail = req.user.email;

    // 5. Call mobile auth Lambda
    const response = await axios.post(
      `${config.mobileAuth.apiUrl}/send-to-mobile`,
      {
        email: userEmail,
        phoneNumber: phoneNumber,
        apiKey: config.mobileAuth.apiKey,
        dashboardId: dashboardId || null
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );

    // 6. Return success
    res.json({
      success: true,
      message: 'Magic link sent to your phone',
      phoneNumber: maskPhoneNumber(phoneNumber)
    });

  } catch (error) {
    console.error('Error sending to mobile:', error);

    // Handle different error types
    if (error.response) {
      // Lambda returned an error
      res.status(error.response.status).json({
        error: 'Failed to send to mobile',
        message: error.response.data.message || error.response.data.error
      });
    } else if (error.request) {
      // Request failed (network error)
      res.status(503).json({
        error: 'Service unavailable',
        message: 'Unable to reach mobile authentication service'
      });
    } else {
      // Other error
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to send magic link'
      });
    }
  }
});

/**
 * Validate phone number format (E.164)
 */
function isValidPhoneNumber(phoneNumber) {
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber);
}

/**
 * Mask phone number for display
 */
function maskPhoneNumber(phoneNumber) {
  // +14155551234 -> +1415***1234
  if (phoneNumber.length > 7) {
    const visible = phoneNumber.slice(0, -4);
    const masked = visible.slice(0, 5) + '***' + phoneNumber.slice(-4);
    return masked;
  }
  return phoneNumber;
}

module.exports = router;
```

### Python/Flask Example

```python
# routes/mobile.py
from flask import Blueprint, request, jsonify, session
import requests
import re
import os

mobile_bp = Blueprint('mobile', __name__)

MOBILE_AUTH_API_KEY = os.environ.get('MOBILE_AUTH_API_KEY')
MOBILE_AUTH_API_URL = os.environ.get('MOBILE_AUTH_API_URL', 
    'https://abc123.execute-api.us-west-2.amazonaws.com/v1/auth')

@mobile_bp.route('/send-to-mobile', methods=['POST'])
def send_to_mobile():
    """Send magic link to user's mobile device"""
    
    # 1. Verify user is authenticated (Okta session)
    if 'user' not in session or 'email' not in session['user']:
        return jsonify({
            'error': 'Not authenticated',
            'message': 'User must be logged in to send to mobile'
        }), 401
    
    # 2. Extract request data
    data = request.get_json()
    phone_number = data.get('phoneNumber')
    dashboard_id = data.get('dashboardId')
    
    # 3. Validate phone number
    if not phone_number or not is_valid_phone_number(phone_number):
        return jsonify({
            'error': 'Invalid phone number',
            'message': 'Please provide a valid phone number in E.164 format'
        }), 400
    
    # 4. Get user email from session
    user_email = session['user']['email']
    
    # 5. Call mobile auth Lambda
    try:
        response = requests.post(
            f'{MOBILE_AUTH_API_URL}/send-to-mobile',
            json={
                'email': user_email,
                'phoneNumber': phone_number,
                'apiKey': MOBILE_AUTH_API_KEY,
                'dashboardId': dashboard_id
            },
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        response.raise_for_status()
        
        # 6. Return success
        return jsonify({
            'success': True,
            'message': 'Magic link sent to your phone',
            'phoneNumber': mask_phone_number(phone_number)
        })
        
    except requests.exceptions.HTTPError as e:
        return jsonify({
            'error': 'Failed to send to mobile',
            'message': e.response.json().get('message', 'Unknown error')
        }), e.response.status_code
        
    except requests.exceptions.RequestException as e:
        return jsonify({
            'error': 'Service unavailable',
            'message': 'Unable to reach mobile authentication service'
        }), 503

def is_valid_phone_number(phone_number):
    """Validate E.164 phone number format"""
    pattern = r'^\+[1-9]\d{1,14}$'
    return bool(re.match(pattern, phone_number))

def mask_phone_number(phone_number):
    """Mask phone number for display"""
    if len(phone_number) > 7:
        return phone_number[:5] + '***' + phone_number[-4:]
    return phone_number
```

---

## Step 3: Frontend UI Implementation

### React Component Example

```typescript
// components/SendToMobileModal.tsx
import React, { useState } from 'react';
import { Modal, Button, Input, Alert } from 'your-ui-library';

interface SendToMobileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDashboardId?: string;
}

export const SendToMobileModal: React.FC<SendToMobileModalProps> = ({
  isOpen,
  onClose,
  currentDashboardId
}) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSend = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/mobile/send-to-mobile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber,
          dashboardId: currentDashboardId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send to mobile');
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setPhoneNumber('');
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="modal-content">
        <h2>Send to Mobile</h2>
        
        {success ? (
          <Alert type="success">
            Magic link sent! Check your phone for the SMS.
          </Alert>
        ) : (
          <>
            <p>Enter your phone number to receive a magic link to open this dashboard on your mobile device.</p>
            
            <Input
              type="tel"
              placeholder="+1 (415) 555-1234"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={loading}
            />
            
            {error && (
              <Alert type="error">{error}</Alert>
            )}
            
            <div className="button-group">
              <Button onClick={onClose} variant="secondary" disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={loading || !phoneNumber}>
                {loading ? 'Sending...' : 'Send Magic Link'}
              </Button>
            </div>
            
            <p className="help-text">
              Format: +1 (country code) followed by your number
            </p>
          </>
        )}
      </div>
    </Modal>
  );
};
```

### Add Button to Dashboard

```typescript
// In your Dashboard component
import { SendToMobileModal } from './SendToMobileModal';

export const Dashboard = () => {
  const [showMobileModal, setShowMobileModal] = useState(false);
  const currentDashboardId = 'workbook_abc123'; // Get from your routing/state

  return (
    <div>
      {/* Your existing dashboard UI */}
      
      <button onClick={() => setShowMobileModal(true)}>
        📱 Send to Mobile
      </button>

      <SendToMobileModal
        isOpen={showMobileModal}
        onClose={() => setShowMobileModal(false)}
        currentDashboardId={currentDashboardId}
      />
    </div>
  );
};
```

---

## Step 4: Phone Number Input Formatting

### JavaScript Phone Number Formatter

```javascript
/**
 * Format phone number as user types
 * Converts: 4155551234 -> +1 (415) 555-1234
 */
export function formatPhoneNumber(value) {
  // Remove all non-digits
  const cleaned = value.replace(/\D/g, '');
  
  // Handle different lengths
  if (cleaned.length === 0) {
    return '';
  } else if (cleaned.length <= 3) {
    return `+1 (${cleaned}`;
  } else if (cleaned.length <= 6) {
    return `+1 (${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
  } else if (cleaned.length <= 10) {
    return `+1 (${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else {
    return `+1 (${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  }
}

/**
 * Convert formatted phone to E.164
 * +1 (415) 555-1234 -> +14155551234
 */
export function toE164(phoneNumber) {
  const cleaned = phoneNumber.replace(/\D/g, '');
  return `+${cleaned}`;
}
```

---

## Step 5: Error Handling

### Common Error Scenarios

```javascript
// Handle all error cases in your frontend
const handleSendToMobile = async (phoneNumber) => {
  try {
    const response = await fetch('/api/mobile/send-to-mobile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        phoneNumber: toE164(phoneNumber),
        dashboardId: currentDashboardId 
      })
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle specific error codes
      switch (response.status) {
        case 400:
          throw new Error('Invalid phone number format. Use +1 followed by your 10-digit number.');
        case 401:
          throw new Error('Please sign in to continue.');
        case 403:
          throw new Error('Your account is not approved for mobile access.');
        case 503:
          throw new Error('Mobile service is temporarily unavailable. Please try again.');
        default:
          throw new Error(data.message || 'Failed to send magic link.');
      }
    }

    return data;
  } catch (error) {
    if (error.name === 'TypeError') {
      throw new Error('Network error. Please check your connection.');
    }
    throw error;
  }
};
```

---

## Step 6: Testing the Integration

### Manual Testing

1. **Login to desktop app** with Okta
2. **Click "Send to Mobile"** button
3. **Enter phone number** in format: +14155551234
4. **Click Send**
5. **Check phone** for SMS within 30 seconds
6. **Click magic link** on mobile device
7. **Verify** mobile app opens and authenticates

### Test Script

```javascript
// test-send-to-mobile.js
const axios = require('axios');

async function testSendToMobile() {
  try {
    const response = await axios.post(
      'http://localhost:3000/api/mobile/send-to-mobile',
      {
        phoneNumber: '+14155551234',
        dashboardId: 'workbook_test'
      },
      {
        headers: {
          'Cookie': 'session=YOUR_SESSION_COOKIE' // Get from browser dev tools
        }
      }
    );

    console.log('✅ Success:', response.data);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testSendToMobile();
```

---

## Step 7: Monitoring and Logging

### Backend Logging

```javascript
// Add logging to your endpoint
router.post('/send-to-mobile', async (req, res) => {
  const requestId = generateRequestId();
  
  console.log(`[${requestId}] Send to mobile request`, {
    user: req.user.email,
    phoneNumber: maskPhoneNumber(req.body.phoneNumber),
    dashboardId: req.body.dashboardId
  });

  try {
    const response = await callMobileAuthLambda(/*...*/);
    
    console.log(`[${requestId}] Success - SMS sent`, {
      user: req.user.email,
      phoneNumber: maskPhoneNumber(req.body.phoneNumber)
    });
    
    res.json({ success: true });
    
  } catch (error) {
    console.error(`[${requestId}] Failed to send to mobile`, {
      user: req.user.email,
      error: error.message,
      status: error.response?.status
    });
    
    res.status(500).json({ error: 'Failed to send' });
  }
});
```

### CloudWatch Metrics

```javascript
// Optional: Send metrics to CloudWatch
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

async function recordSendToMobileMetric(success) {
  const client = new CloudWatchClient({});
  
  await client.send(new PutMetricDataCommand({
    Namespace: 'BigBuysDesktop',
    MetricData: [{
      MetricName: 'SendToMobileRequests',
      Value: 1,
      Unit: 'Count',
      Dimensions: [{
        Name: 'Status',
        Value: success ? 'Success' : 'Failure'
      }]
    }]
  }));
}
```

---

## Security Checklist

- [ ] API key is stored securely (not in code)
- [ ] User must be authenticated to call endpoint
- [ ] Phone numbers are validated before sending to Lambda
- [ ] Phone numbers are masked in logs
- [ ] Rate limiting is implemented (max 3 SMS per user per hour)
- [ ] HTTPS is enforced for all API calls
- [ ] Session validation happens on every request
- [ ] Error messages don't leak sensitive information

---

## Rate Limiting Implementation

```javascript
// Simple in-memory rate limiter
const rateLimiter = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 3;

  if (!rateLimiter.has(userId)) {
    rateLimiter.set(userId, []);
  }

  const userRequests = rateLimiter.get(userId);
  
  // Remove old requests outside the window
  const recentRequests = userRequests.filter(time => now - time < windowMs);
  
  if (recentRequests.length >= maxRequests) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }

  recentRequests.push(now);
  rateLimiter.set(userId, recentRequests);
}

// Use in endpoint
router.post('/send-to-mobile', async (req, res) => {
  try {
    checkRateLimit(req.user.id);
    // ... rest of handler
  } catch (error) {
    if (error.message.includes('Rate limit')) {
      return res.status(429).json({ error: error.message });
    }
    throw error;
  }
});
```

---

## Troubleshooting

### SMS Not Received

1. Check phone number format (must be E.164: +14155551234)
2. Check AWS SNS sending limits
3. Check Lambda CloudWatch logs for errors
4. Verify phone number can receive SMS (carrier restrictions)

### "Invalid API Key" Error

1. Verify API key matches what's in AWS Secrets Manager
2. Check environment variable is loaded correctly
3. Ensure no extra whitespace in API key

### "Email not approved" Error

1. Verify user's email is @sigmacomputing.com or in approved list
2. Check DynamoDB approved-emails table
3. Add email to approved list if needed

---

## Production Deployment

### Environment Variables

```bash
# Production .env
MOBILE_AUTH_API_KEY=<get from AWS Secrets Manager>
MOBILE_AUTH_API_URL=https://YOUR-API-ID.execute-api.us-west-2.amazonaws.com/v1/auth
NODE_ENV=production
```

### Health Check Endpoint

```javascript
// Add health check to verify mobile auth service
router.get('/mobile/health', async (req, res) => {
  try {
    // Simple ping to verify service is reachable
    const response = await axios.get(
      `${config.mobileAuth.apiUrl}/health`,
      { timeout: 5000 }
    );
    
    res.json({ 
      status: 'healthy',
      mobileAuthService: 'available'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'degraded',
      mobileAuthService: 'unavailable'
    });
  }
});
```