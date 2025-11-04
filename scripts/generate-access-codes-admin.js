/**
 * Access Code Generator Script (Production/Admin Version)
 * 
 * This script generates access codes using Firebase Admin SDK (requires service account).
 * This is the SECURE way to generate codes in production.
 * 
 * Usage:
 *   node scripts/generate-access-codes-admin.js [count] [length]
 * 
 * Arguments:
 *   count  - Number of access codes to generate (default: 10)
 *   length - Length of each access code (default: 8 characters)
 * 
 * Example:
 *   node scripts/generate-access-codes-admin.js 50 8
 * 
 * Prerequisites:
 *   1. Install dependencies: npm install firebase-admin dotenv
 *   2. Download Firebase service account key (see instructions below)
 *   3. Save service account key as: serviceAccountKey.json (in project root) OR
 *      Set GOOGLE_APPLICATION_CREDENTIALS environment variable
 * 
 * How to get service account key:
 *   1. Go to Firebase Console > Project Settings > Service Accounts
 *   2. Click "Generate New Private Key"
 *   3. Save the JSON file as serviceAccountKey.json in project root
 *   4. Add serviceAccountKey.json to .gitignore (IMPORTANT!)
 */

const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin SDK
let serviceAccount;

try {
  // Try to load service account from file
  const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');
  serviceAccount = require(serviceAccountPath);
} catch (error) {
  // If file doesn't exist, try to use credentials from environment
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    } catch (parseError) {
      console.error('Error: Could not parse FIREBASE_SERVICE_ACCOUNT_KEY from environment');
      console.error('Please provide serviceAccountKey.json file or set FIREBASE_SERVICE_ACCOUNT_KEY environment variable');
      process.exit(1);
    }
  } else {
    console.error('Error: Could not find serviceAccountKey.json');
    console.error('\nPlease download your Firebase service account key:');
    console.error('1. Go to Firebase Console > Project Settings > Service Accounts');
    console.error('2. Click "Generate New Private Key"');
    console.error('3. Save the JSON file as serviceAccountKey.json in the project root');
    console.error('4. Add serviceAccountKey.json to .gitignore');
    console.error('\nAlternatively, set FIREBASE_SERVICE_ACCOUNT_KEY environment variable with the JSON content.');
    process.exit(1);
  }
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// Generate a random access code
function generateAccessCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate unique access codes
async function generateAccessCodes(count = 10, length = 8) {
  console.log(`Generating ${count} access codes (length: ${length})...\n`);

  const codes = [];
  const generatedCodes = new Set();

  // Generate unique codes
  while (codes.length < count) {
    const code = generateAccessCode(length);
    if (!generatedCodes.has(code)) {
      generatedCodes.add(code);
      codes.push(code);
    }
  }

  // Save to Firestore using Admin SDK
  const batch = db.batch();
  for (const code of codes) {
    const accessCodeRef = db.collection('accessCodes').doc(code);
    batch.set(accessCodeRef, {
      code: code,
      used: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    console.log('✅ Successfully generated and saved access codes:\n');
    codes.forEach((code, index) => {
      console.log(`  ${index + 1}. ${code}`);
    });
    console.log(`\nTotal: ${codes.length} access codes`);
    console.log('\nThese codes are now available for users to sign up.');
  } catch (error) {
    console.error('Error saving access codes:', error);
    process.exit(1);
  }
}

// Get command line arguments
const count = parseInt(process.argv[2]) || 10;
const length = parseInt(process.argv[3]) || 8;

if (count < 1 || count > 1000) {
  console.error('Error: Count must be between 1 and 1000');
  process.exit(1);
}

if (length < 4 || length > 20) {
  console.error('Error: Length must be between 4 and 20');
  process.exit(1);
}

// Run the generator
generateAccessCodes(count, length)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });

