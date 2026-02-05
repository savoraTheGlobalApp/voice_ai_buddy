import { Platform } from 'react-native';
import { router } from 'expo-router';

// Conditionally import Firebase messaging (only available in native builds)
let messaging: any = null;

async function getMessaging() {
  if (messaging) return messaging;

  if (Platform.OS === 'web') {
    console.log('Push notifications not supported on web');
    return null;
  }

  try {
    const firebaseMessaging = await import('@react-native-firebase/messaging');
    messaging = firebaseMessaging.default();
    return messaging;
  } catch (e) {
    console.log('Firebase messaging not available (requires native build):', e);
    return null;
  }
}

/**
 * Request notification permissions and get FCM token
 */
export async function registerForPushNotifications(): Promise<string | null> {
  const msg = await getMessaging();
  if (!msg) return null;

  try {
    // Request permission (iOS requires explicit permission, Android grants by default)
    const authStatus = await msg.requestPermission();
    const enabled =
      authStatus === 1 || // AUTHORIZED
      authStatus === 2;   // PROVISIONAL

    if (!enabled) {
      console.log('Push notification permission denied');
      return null;
    }

    // Get FCM token
    const token = await msg.getToken();
    console.log('FCM Token:', token);
    return token;
  } catch (e) {
    console.error('Failed to get FCM token:', e);
    return null;
  }
}

/**
 * Send FCM token to backend for storage
 */
export async function registerTokenWithBackend(
  uid: string,
  token: string,
  apiClient: <T>(endpoint: string, options?: RequestInit) => Promise<T>
): Promise<void> {
  try {
    await apiClient(`/api/users/${uid}/fcm-token`, {
      method: 'POST',
      body: JSON.stringify({
        token,
        platform: Platform.OS,
      }),
    });
    console.log('FCM token registered with backend');
  } catch (e) {
    console.error('Failed to register FCM token with backend:', e);
  }
}

/**
 * Handle deep links from notifications
 */
function handleDeepLink(deepLink: string | undefined) {
  if (!deepLink) return;

  // Parse deep link and navigate
  // Expected formats:
  // - /stories/{sessionId} - open a specific story
  // - /stories/create - open story creation
  // - /settings - open settings

  try {
    if (deepLink.startsWith('/')) {
      router.push(deepLink as any);
    } else if (deepLink.startsWith('yourstory://')) {
      const path = deepLink.replace('yourstory://', '/');
      router.push(path as any);
    }
  } catch (e) {
    console.error('Failed to handle deep link:', e);
  }
}

/**
 * Set up notification listeners
 */
export async function setupNotificationListeners(
  uid: string,
  apiClient: <T>(endpoint: string, options?: RequestInit) => Promise<T>
): Promise<() => void> {
  const msg = await getMessaging();
  if (!msg) return () => {};

  // Handle notification when app is in foreground
  const unsubscribeForeground = msg.onMessage(async (remoteMessage: any) => {
    console.log('Foreground notification:', remoteMessage);
    // Could show an in-app notification here
  });

  // Handle notification tap when app is in background
  const unsubscribeBackground = msg.onNotificationOpenedApp((remoteMessage: any) => {
    console.log('Background notification opened:', remoteMessage);
    const deepLink = remoteMessage.data?.deep_link;
    handleDeepLink(deepLink);

    // Track notification opened
    trackNotificationOpened(uid, remoteMessage.data?.notification_id, apiClient);
  });

  // Check if app was opened from a notification (app was quit)
  const initialNotification = await msg.getInitialNotification();
  if (initialNotification) {
    console.log('App opened from quit state via notification:', initialNotification);
    const deepLink = initialNotification.data?.deep_link;
    handleDeepLink(deepLink);

    // Track notification opened
    trackNotificationOpened(uid, initialNotification.data?.notification_id, apiClient);
  }

  // Listen for token refresh
  const unsubscribeTokenRefresh = msg.onTokenRefresh(async (newToken: string) => {
    console.log('FCM token refreshed:', newToken);
    await registerTokenWithBackend(uid, newToken, apiClient);
  });

  // Return cleanup function
  return () => {
    unsubscribeForeground();
    unsubscribeBackground();
    unsubscribeTokenRefresh();
  };
}

/**
 * Track when a notification is opened (for analytics)
 */
async function trackNotificationOpened(
  uid: string,
  notificationId: string | undefined,
  apiClient: <T>(endpoint: string, options?: RequestInit) => Promise<T>
): Promise<void> {
  if (!notificationId) return;

  try {
    await apiClient(`/api/users/${uid}/notification-opened`, {
      method: 'POST',
      body: JSON.stringify({ notification_id: notificationId }),
    });
  } catch (e) {
    console.error('Failed to track notification opened:', e);
  }
}

/**
 * Initialize push notifications for a user
 */
export async function initializePushNotifications(
  uid: string,
  apiClient: <T>(endpoint: string, options?: RequestInit) => Promise<T>
): Promise<() => void> {
  // Get FCM token and register with backend
  const token = await registerForPushNotifications();
  if (token) {
    await registerTokenWithBackend(uid, token, apiClient);
  }

  // Set up notification listeners
  const cleanup = await setupNotificationListeners(uid, apiClient);

  return cleanup;
}
