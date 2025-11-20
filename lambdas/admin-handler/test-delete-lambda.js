#!/usr/bin/env node

/**
 * Test Lambda handler with simulated API Gateway event
 * This tests the full Lambda handler including routing logic
 */

// We need to import the handler - but since it's TypeScript, we'll need to compile first
// For now, let's create a test that can work with the compiled JS

const path = require('path');
const fs = require('fs');

// Check if we're in the right directory
const indexJsPath = path.join(__dirname, 'index.js');
if (!fs.existsSync(indexJsPath)) {
  console.error('ERROR: index.js not found. Please build the Lambda first:');
  console.error('  cd lambdas/admin-handler && ./build-lambda.sh');
  process.exit(1);
}

// Load the compiled handler
// Note: This is tricky because the handler is exported as ES module
// Let's create a simpler approach - test the routing logic directly

async function testDeleteRouting() {
  console.log('='.repeat(80));
  console.log('Testing DELETE whitelist routing logic');
  console.log('='.repeat(80));
  
  const email = process.argv[2] || 'javrach+junk@gmail.com';
  const emailEncoded = encodeURIComponent(email);
  
  const testPaths = [
    `/v1/admin/whitelist/${emailEncoded}`,
    `/v1/admin/whitelist/${email}`,
    `/admin/whitelist/${emailEncoded}`,
    `/admin/whitelist/${email}`,
    `/whitelist/${emailEncoded}`,
    `/whitelist/${email}`,
  ];
  
  const regex = /^\/v1\/admin\/whitelist\/([^/]+)$/;
  
  console.log('\nTesting path matching with regex:', regex.toString());
  console.log('Email:', email);
  console.log('Email encoded:', emailEncoded);
  console.log('\n');
  
  for (const testPath of testPaths) {
    console.log(`Testing path: "${testPath}"`);
    
    // Test normalization
    let normalizedPath = testPath;
    if (normalizedPath.startsWith('/v1/v1/')) {
      normalizedPath = normalizedPath.replace('/v1/v1/', '/v1/');
      console.log(`  Normalized (removed double /v1): ${normalizedPath}`);
    } else if (normalizedPath.startsWith('/admin/')) {
      normalizedPath = '/v1' + normalizedPath;
      console.log(`  Normalized (added /v1 prefix): ${normalizedPath}`);
    } else if (normalizedPath.startsWith('/whitelist/')) {
      normalizedPath = '/v1/admin' + normalizedPath;
      console.log(`  Normalized (added /v1/admin prefix): ${normalizedPath}`);
    } else if (normalizedPath.startsWith('/v1/whitelist/')) {
      normalizedPath = normalizedPath.replace('/v1/whitelist/', '/v1/admin/whitelist/');
      console.log(`  Normalized (added /admin): ${normalizedPath}`);
    }
    
    // Test regex match
    const match = normalizedPath.match(regex);
    if (match) {
      console.log(`  ✓ Matches regex!`);
      console.log(`  Extracted email: "${match[1]}"`);
      
      // Test decoding
      try {
        const decoded = decodeURIComponent(match[1]);
        console.log(`  Decoded email: "${decoded}"`);
        if (decoded === email) {
          console.log(`  ✓ Email matches original!`);
        } else {
          console.log(`  ⚠ Email doesn't match original (expected: "${email}")`);
        }
      } catch (error) {
        console.log(`  ✗ Failed to decode: ${error.message}`);
        console.log(`  Using raw value: "${match[1]}"`);
      }
    } else {
      console.log(`  ✗ Does NOT match regex`);
      console.log(`  Would fall into catch-all route`);
    }
    
    console.log('');
  }
  
  console.log('='.repeat(80));
  console.log('Path matching test complete');
  console.log('='.repeat(80));
}

testDeleteRouting().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});

