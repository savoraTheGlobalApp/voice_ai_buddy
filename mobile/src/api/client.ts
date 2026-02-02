import { auth } from '../lib/firebase';

// TODO: Move to environment variable
const BACKEND_URL = 'https://voiceaibuddy-production.up.railway.app/';

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
    throw new Error('Rate limit reached. Please try again later.');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed: ${response.status}`);
  }

  return response.json();
}
