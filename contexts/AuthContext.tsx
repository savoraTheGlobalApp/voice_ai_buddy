'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
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
    try {
      await setDoc(
        accessCodeDocRef,
        {
          used: true,
          usedBy: user.uid,
          usedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error: any) {
      console.error('Error marking access code as used:', error);
      // Don't throw here - user is already created, we can mark code as used later
      // This is a non-critical error
      if (error?.code === 'permission-denied') {
        console.warn('Could not mark access code as used due to permissions. This may need admin intervention.');
      }
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

