/**
 * Access Code Generator Script
 * 
 * This script generates access codes and stores them in Firebase Firestore.
 * Run this script to create access codes that users can use to sign up.
 * 
 * Usage:
 *   node scripts/generate-access-codes.js [count] [length]
 * 
 * Arguments:
 *   count  - Number of access codes to generate (default: 10)
 *   length - Length of each access code (default: 8 characters)
 * 
 * Example:
 *   node scripts/generate-access-codes.js 50 8
 * 
 * Prerequisites:
 *   1. Install dependencies: npm install firebase
 *   2. Set up Firebase environment variables in .env.local
 *   3. Make sure Firebase project is initialized with Firestore
 */

// Use Firebase compat version for CommonJS compatibility
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
require('dotenv').config({ path: '.env.local' });

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Validate configuration
const requiredEnvVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Error: Missing Firebase environment variables:');
  missingVars.forEach(varName => console.error(`  - ${varName}`));
  console.error('\nPlease set these variables in your .env.local file.');
  console.error('See FIREBASE_SETUP.md for detailed instructions.');
  process.exit(1);
}

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

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

  // Save to Firestore
  const batch = db.batch();
  for (const code of codes) {
    const accessCodeRef = db.collection('accessCodes').doc(code);
    batch.set(accessCodeRef, {
      code: code,
      used: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
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
    if (error.code === 'permission-denied' || error.message.includes('PERMISSION_DENIED')) {
      console.error('\n❌ Permission Denied Error!');
      console.error('\nYou are using production security rules which restrict writes to Firestore.');
      console.error('\nSolution: Use the Admin script instead:');
      console.error('  1. Download service account key from Firebase Console → Project Settings → Service Accounts');
      console.error('  2. Save it as serviceAccountKey.json in project root');
      console.error('  3. Run: node scripts/generate-access-codes-admin.js [count] [length]');
      console.error('\nFor detailed instructions, see: PRODUCTION_ACCESS_CODE_GENERATION.md');
    } else {
      console.error('Error saving access codes:', error);
    }
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

