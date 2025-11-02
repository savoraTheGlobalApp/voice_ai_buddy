'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function AccessCodePage() {
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const router = useRouter();

  const validateAccessCode = async (code: string): Promise<boolean> => {
    try {
      const normalizedCode = code.trim().toUpperCase();
      const accessCodeDocRef = doc(db, 'accessCodes', normalizedCode);
      const accessCodeDocSnap = await getDoc(accessCodeDocRef);

      if (!accessCodeDocSnap.exists()) {
        // Invalid code - this is expected, don't log as error
        // User will see error message in UI
        return false;
      }

      const accessCodeData = accessCodeDocSnap.data();
      if (!accessCodeData) {
        // Invalid code - this is expected, don't log as error
        return false;
      }

      if (accessCodeData.used) {
        setError('This access code has already been used');
        return false;
      }

      return true;
    } catch (error: any) {
      // Only log actual errors (network issues, permission problems, etc.)
      // Not invalid codes (those are expected)
      if (error?.code === 'permission-denied' || error?.message?.includes('PERMISSION_DENIED')) {
        console.error('Permission denied when validating access code:', error);
        setError('Permission denied. Please check Firestore security rules allow public reads for accessCodes collection.');
      } else if (error?.code !== 'missing') {
        // 'missing' errors are just "document not found" which is normal for invalid codes
        console.error('Error validating access code:', error);
        setError('Error validating access code. Please try again.');
      } else {
        // Document not found - this is normal for invalid codes, just return false
        return false;
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!accessCode.trim()) {
      setError('Please enter an access code');
      setLoading(false);
      return;
    }

    const isValid = await validateAccessCode(accessCode);
    
    if (isValid) {
      // Store access code in sessionStorage temporarily
      sessionStorage.setItem('pendingAccessCode', accessCode.trim().toUpperCase());
      router.push('/signup');
    } else {
      if (!error) {
        setError('Invalid access code. Please check and try again.');
      }
      setLoading(false);
    }
  };

  const handleSignInClick = () => {
    setShowSignIn(true);
    router.push('/signin');
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f3f4f6',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '12px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          maxWidth: '400px',
          width: '100%',
        }}
      >
        <h1
          style={{
            fontSize: '28px',
            fontWeight: 700,
            marginBottom: '8px',
            color: '#111827',
            textAlign: 'center',
          }}
        >
          Welcome
        </h1>
        <p
          style={{
            fontSize: '16px',
            color: '#6b7280',
            marginBottom: '32px',
            textAlign: 'center',
          }}
        >
          Enter your access code to get started
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="accessCode"
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              Access Code
            </label>
            <input
              id="accessCode"
              type="text"
              value={accessCode}
              onChange={(e) => {
                setAccessCode(e.target.value.toUpperCase());
                setError('');
              }}
              placeholder="Enter access code"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '16px',
                border: error ? '2px solid #ef4444' : '2px solid #e5e7eb',
                borderRadius: '8px',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#3b82f6';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = error ? '#ef4444' : '#e5e7eb';
              }}
              autoComplete="off"
            />
            {error && (
              <p
                style={{
                  color: '#ef4444',
                  fontSize: '14px',
                  marginTop: '8px',
                }}
              >
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 600,
              color: 'white',
              backgroundColor: loading ? '#9ca3af' : '#3b82f6',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
              marginBottom: '16px',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#2563eb';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#3b82f6';
              }
            }}
          >
            {loading ? 'Validating...' : 'Continue'}
          </button>
        </form>

        <div
          style={{
            marginTop: '24px',
            paddingTop: '24px',
            borderTop: '1px solid #e5e7eb',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontSize: '14px',
              color: '#6b7280',
              marginBottom: '8px',
            }}
          >
            Already have an account?
          </p>
          <button
            type="button"
            onClick={handleSignInClick}
            style={{
              color: '#3b82f6',
              fontSize: '14px',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
}

