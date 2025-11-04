'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

interface UserData {
  uid: string;
  name: string;
  age: number;
  email: string;
  accessCode: string;
  createdAt: any;
}

interface AuthContextType {
  currentUser: User | null;
  userData: UserData | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    name: string,
    age: number,
    email: string,
    password: string,
    accessCode: string
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user data from Firestore
  const fetchUserData = async (uid: string) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        setUserData(userDocSnap.data() as UserData);
      } else {
        setUserData(null);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setUserData(null);
    }
  };

  // Monitor auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await fetchUserData(user.uid);
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signUp = async (
    name: string,
    age: number,
    email: string,
    password: string,
    accessCode: string
  ) => {
    const normalizedCode = accessCode.trim().toUpperCase();
    
    // Validate access code before creating user
    const accessCodeDocRef = doc(db, 'accessCodes', normalizedCode);
    let accessCodeDocSnap;
    
    try {
      accessCodeDocSnap = await getDoc(accessCodeDocRef);
    } catch (error: any) {
      console.error('Error reading access code:', error);
      if (error?.code === 'permission-denied') {
        throw new Error('Permission denied. Please check Firestore security rules.');
      }
      throw new Error('Error validating access code. Please try again.');
    }

    if (!accessCodeDocSnap.exists()) {
      throw new Error('Invalid access code');
    }

    const accessCodeData = accessCodeDocSnap.data();
    if (!accessCodeData) {
      throw new Error('Invalid access code');
    }

    if (accessCodeData.used) {
      throw new Error('This access code has already been used');
    }

    // Create user account
    let userCredential;
    try {
      userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
    } catch (error: any) {
      // Handle Firebase Auth errors
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('This email is already registered. Please sign in instead.');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('Password is too weak. Please choose a stronger password.');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address.');
      }
      throw new Error(error.message || 'Error creating account. Please try again.');
    }

    const user = userCredential.user;

    // Double-check: Re-validate access code is still unused right before creating user
    // This prevents race conditions where two users might be signing up simultaneously
    try {
      const recheckSnap = await getDoc(accessCodeDocRef);
      if (!recheckSnap.exists()) {
        // Code was deleted or invalidated between checks
        try {
          await user.delete();
        } catch (deleteError) {
          console.error('Error deleting user account after rollback:', deleteError);
        }
        throw new Error('Invalid access code');
      }
      const recheckData = recheckSnap.data();
      if (recheckData?.used) {
        // Code was used between initial check and now (race condition)
        try {
          await user.delete();
        } catch (deleteError) {
          console.error('Error deleting user account after rollback:', deleteError);
        }
        throw new Error('This access code has already been used. Please use a different code.');
      }
    } catch (error: any) {
      // If recheck fails with a different error, try to clean up and throw
      if (error.message && (error.message.includes('access code') || error.message.includes('already been used'))) {
        throw error;
      }
      // If it's a network/permission error during recheck, still try to proceed
      // but log it for investigation
      console.warn('Could not re-validate access code before user creation:', error);
    }

    // Save user data to Firestore
    const userDataToSave: UserData = {
      uid: user.uid,
      name,
      age,
      email,
      accessCode: normalizedCode,
      createdAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'users', user.uid), userDataToSave);
    } catch (error: any) {
      console.error('Error saving user data:', error);
      // If user data save fails, try to delete the auth account to rollback
      try {
        await user.delete();
      } catch (deleteError) {
        console.error('Error deleting user account after rollback:', deleteError);
      }
      throw new Error('Error saving user data. Please try again.');
    }

    // Mark access code as used (now user is authenticated, so they can update)
    // This is CRITICAL - if it fails, we must rollback user creation
    try {
      // Use a conditional update: only update if code is still unused
      // This prevents overwriting if another user somehow used it
      const finalCheckSnap = await getDoc(accessCodeDocRef);
      if (!finalCheckSnap.exists()) {
        // Code was deleted after user creation - this is unexpected but handle gracefully
        console.error('Access code document missing after user creation. User created but code not marked.');
        // Don't rollback user - they've already been created, but log for admin
      } else {
        const finalCheckData = finalCheckSnap.data();
        if (finalCheckData?.used && finalCheckData?.usedBy !== user.uid) {
          // Another user used the code - this is a serious race condition
          // We should rollback this user creation
          console.error('Race condition detected: Access code was used by another user. Rolling back user creation.');
          try {
            const userDocRef = doc(db, 'users', user.uid);
            await deleteDoc(userDocRef).catch(() => {}); // Try to delete user doc (may fail due to permissions)
            await user.delete(); // Delete auth account
          } catch (rollbackError) {
            console.error('Failed to rollback user creation:', rollbackError);
          }
          throw new Error('This access code has already been used. Please use a different code.');
        }
        
        // Mark as used (safe to do now)
        await setDoc(
          accessCodeDocRef,
          {
            used: true,
            usedBy: user.uid,
            usedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (error: any) {
      console.error('Error marking access code as used:', error);
      // If marking fails due to permission, we have a serious problem
      // Rollback user creation since we can't mark the code as used
      if (error?.code === 'permission-denied' || error.message?.includes('already been used')) {
        console.error('Cannot mark access code as used. Rolling back user creation.');
        try {
          // Try to delete user document
          const userDocRef = doc(db, 'users', user.uid);
          await deleteDoc(userDocRef).catch(() => {}); // May fail due to permissions, but try
          // Delete auth account
          await user.delete();
        } catch (rollbackError) {
          console.error('Failed to rollback user creation:', rollbackError);
        }
        if (error.message?.includes('already been used')) {
          throw error;
        }
        throw new Error('Failed to complete signup. Please try again or contact support.');
      }
      // For other errors, still throw but don't rollback (user is created, code might be marked)
      throw new Error('Account created but there was an error. Please contact support.');
    }

    // Set user data in context - this will trigger the useEffect to fetch full data
    setUserData(userDataToSave);
  };

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
    // User data will be fetched automatically by the useEffect
  };

  const logout = async () => {
    await signOut(auth);
    setUserData(null);
  };

  const value: AuthContextType = {
    currentUser,
    userData,
    loading,
    signUp,
    signIn,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

