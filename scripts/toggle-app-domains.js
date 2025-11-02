#!/usr/bin/env node

/**
 * Toggle associatedDomains in app.json for TestFlight vs Expo Go
 * Usage: node scripts/toggle-app-domains.js testflight|expogo
 */

const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, '../app.json');
const mode = process.argv[2];

if (!mode || !['testflight', 'expogo'].includes(mode)) {
  console.error('Usage: node scripts/toggle-app-domains.js [testflight|expogo]');
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

if (mode === 'testflight') {
  // Enable associatedDomains for TestFlight
  if (!appJson.expo.ios.associatedDomains) {
    appJson.expo.ios.associatedDomains = [];
  }
  if (!appJson.expo.ios.associatedDomains.includes('applinks:mobile.bigbuys.io')) {
    appJson.expo.ios.associatedDomains = ['applinks:mobile.bigbuys.io'];
  }
  console.log('✅ Enabled associatedDomains for TestFlight');
} else if (mode === 'expogo') {
  // Disable associatedDomains for Expo Go
  appJson.expo.ios.associatedDomains = [];
  console.log('✅ Disabled associatedDomains for Expo Go');
}

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
console.log(`📝 Updated app.json for ${mode.toUpperCase()}`);

