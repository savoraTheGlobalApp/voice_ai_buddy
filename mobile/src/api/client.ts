import { auth } from '../lib/firebase';

// TODO: Move to environment variable
// Use local backend for development, deployed URL for production
// Android emulator uses 10.0.2.2 to reach host machine's localhost
import { Platform } from 'react-native';

// Development: Use local backend
// Production: Use Railway backend (PR #33)
const BACKEND_URL = __DEV__
  ? Platform.OS === 'ios'
    ? 'http://localhost:8000'
    : 'http://10.0.2.2:8000'
  : 'https://voiceaibuddybackend-voiceaibuddy-pr-33.up.railway.app';

export async function apiClient<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${BACKEND_URL}${endpoint}`;

  // Get Firebase ID token for authenticated requests
  const token = await auth.currentUser?.getIdToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (response.status === 401) {
    throw new Error('Session expired. Please sign in again.');
  }

  if (response.status === 429) {
    const errorText = await response.text();
    let detail = 'Rate limit reached. Please try again later.';
    try { const parsed = JSON.parse(errorText); if (parsed.detail) detail = parsed.detail; } catch {}
    throw new Error(detail);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed: ${response.status}`);
  }

  return response.json();
}

