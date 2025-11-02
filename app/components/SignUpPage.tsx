'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function SignUpPage() {
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const { signUp } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Get access code from sessionStorage
    const pendingCode = sessionStorage.getItem('pendingAccessCode');
    if (!pendingCode) {
      // If no access code, redirect back to access code page
      router.push('/');
      return;
    }
    setAccessCode(pendingCode);
  }, [router]);

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError('Please enter your name');
      return false;
    }

    const age = parseInt(formData.age);
    if (!formData.age || isNaN(age) || age < 1 || age > 150) {
      setError('Please enter a valid age');
      return false;
    }

    if (!formData.email.trim() || !formData.email.includes('@')) {
      setError('Please enter a valid email address');
      return false;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!validateForm()) {
      return;
    }

    if (!accessCode) {
      setError('Access code is missing. Please go back and enter it again.');
      return;
    }

    setLoading(true);

    try {
      await signUp(
        formData.name.trim(),
        parseInt(formData.age),
        formData.email.trim(),
        formData.password,
        accessCode
      );
      
      // Clear the pending access code from sessionStorage
      sessionStorage.removeItem('pendingAccessCode');
      
      // Wait a moment for auth state to update
      // The AuthContext will handle the redirect via useEffect
      // But we also push manually to ensure redirect happens
      setTimeout(() => {
        router.push('/app');
      }, 100);
    } catch (err: any) {
      console.error('Sign-up error:', err);
      setError(err.message || 'Failed to create account. Please try again.');
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.push('/');
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f3f4f6',
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '12px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          maxWidth: '450px',
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
          Create Account
        </h1>
        <p
          style={{
            fontSize: '16px',
            color: '#6b7280',
            marginBottom: '32px',
            textAlign: 'center',
          }}
        >
          Fill in your details to get started
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label
              htmlFor="name"
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              Name *
            </label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                setError('');
              }}
              placeholder="Enter your name"
              disabled={loading}
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '16px',
                border: error && !formData.name ? '2px solid #ef4444' : '2px solid #e5e7eb',
                borderRadius: '8px',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label
              htmlFor="age"
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              Age *
            </label>
            <input
              id="age"
              type="number"
              min="1"
              max="150"
              value={formData.age}
              onChange={(e) => {
                setFormData({ ...formData, age: e.target.value });
                setError('');
              }}
              placeholder="Enter your age"
              disabled={loading}
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '16px',
                border: error && !formData.age ? '2px solid #ef4444' : '2px solid #e5e7eb',
                borderRadius: '8px',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              Email *
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                setError('');
              }}
              placeholder="Enter your email"
              disabled={loading}
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '16px',
                border: error && !formData.email ? '2px solid #ef4444' : '2px solid #e5e7eb',
                borderRadius: '8px',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              Password *
            </label>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => {
                setFormData({ ...formData, password: e.target.value });
                setError('');
              }}
              placeholder="Enter your password (min. 6 characters)"
              disabled={loading}
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '16px',
                border: error && !formData.password ? '2px solid #ef4444' : '2px solid #e5e7eb',
                borderRadius: '8px',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="confirmPassword"
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '8px',
              }}
            >
              Confirm Password *
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => {
                setFormData({ ...formData, confirmPassword: e.target.value });
                setError('');
              }}
              placeholder="Confirm your password"
              disabled={loading}
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '16px',
                border: error && formData.password !== formData.confirmPassword ? '2px solid #ef4444' : '2px solid #e5e7eb',
                borderRadius: '8px',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <p
              style={{
                color: '#ef4444',
                fontSize: '14px',
                marginBottom: '16px',
                textAlign: 'center',
              }}
            >
              {error}
            </p>
          )}

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
              marginBottom: '12px',
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
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>

          <button
            type="button"
            onClick={handleBack}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#6b7280',
              backgroundColor: 'transparent',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
            }}
          >
            Back
          </button>
        </form>
      </div>
    </div>
  );
}

