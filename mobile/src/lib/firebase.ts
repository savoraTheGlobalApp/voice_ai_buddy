import { initializeApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDhFtZ6lnC0wkdXywbtlr26HPRC9H5yI0A",
  authDomain: "voice-ai-buddy.firebaseapp.com",
  projectId: "voice-ai-buddy",
  storageBucket: "voice-ai-buddy.appspot.com",
  messagingSenderId: "303882939051",
  appId: "1:303882939051:web:803e7a4bba2d3b5775e5ee",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth: use AsyncStorage persistence on native, browser defaults on web
let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}
export { auth };

// Initialize Firestore
export const db = getFirestore(app);

export default app;
