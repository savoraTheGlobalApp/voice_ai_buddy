import { Platform, Alert, PermissionsAndroid, Linking } from 'react-native';
import { router } from 'expo-router';

function showSettingsAlert() {
  Alert.alert(
    'Enable Notifications',
    'To get daily story reminders, please enable notifications for YourStory in your device Settings.',
    [
      { text: 'Not Now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]
  );
}

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

    // Set up Android notification channel for better control
    if (Platform.OS === 'android') {
      await setupAndroidNotificationChannel();
    }

    return messaging;
  } catch (e) {
    console.log('Firebase messaging not available (requires native build):', e);
    return null;
  }
}

/**
 * Set up Android notification channel
 * Required for Android 8.0+ to properly display notifications
 */
async function setupAndroidNotificationChannel() {
  if (Platform.OS !== 'android') return;

  try {
    // Note: react-native-firebase automatically creates a default channel
    // You can customize it by adding channel configuration in AndroidManifest.xml
    // or by using @notifee/react-native for more control
    console.log('Android notification channel ready');
  } catch (e) {
    console.log('Failed to setup notification channel:', e);
  }
}

/**
 * Check if notification permissions are granted
 * Uses Android's PermissionsAndroid API for accurate results
 */
export async function checkNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    if (Platform.OS === 'android') {
      // Android 13+ requires POST_NOTIFICATIONS permission
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      console.log('Android POST_NOTIFICATIONS permission:', granted);
      return granted;
    } else {
      // iOS uses Firebase messaging permission check
      const msg = await getMessaging();
      if (!msg) return false;
      const authStatus = await msg.hasPermission();
      return authStatus === 1 || authStatus === 2; // AUTHORIZED or PROVISIONAL
    }
  } catch (e) {
    console.error('Failed to check notification permission:', e);
    return false;
  }
}

/**
 * Request notification permissions and get FCM token
 */
export async function registerForPushNotifications(): Promise<string | null> {
  const msg = await getMessaging();
  if (!msg) return null;

  try {
    let permissionGranted = false;

    if (Platform.OS === 'android') {
      if (Platform.Version < 33) {
        // Android < 13: no POST_NOTIFICATIONS permission — use Firebase to check actual state
        const authStatus = await msg.hasPermission();
        permissionGranted = authStatus === 1 || authStatus === 2; // AUTHORIZED or PROVISIONAL
        console.log('Android < 13 Firebase auth status:', authStatus, 'granted:', permissionGranted);
        if (!permissionGranted) {
          showSettingsAlert();
        }
      } else {
        // Android 13+: must request POST_NOTIFICATIONS
        const alreadyGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        if (alreadyGranted) {
          console.log('Android notification permission already granted');
          permissionGranted = true;
        } else {
          console.log('Requesting Android POST_NOTIFICATIONS permission...');
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
          permissionGranted = result === PermissionsAndroid.RESULTS.GRANTED;
          console.log('Android permission request result:', result, 'granted:', permissionGranted);
          if (!permissionGranted) {
            showSettingsAlert();
          }
        }
      }
    } else {
      // iOS: requestPermission() shows dialog first time, returns cached status after
      const authStatus = await msg.requestPermission();
      permissionGranted = authStatus === 1 || authStatus === 2;
      console.log('iOS permission status:', authStatus, 'granted:', permissionGranted);
      if (!permissionGranted) {
        showSettingsAlert();
      }
    }

    if (!permissionGranted) {
      console.log('Push notification permission denied by user');
      return null;
    }

    console.log('Notification permission granted');

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
 * Display a local notification (for foreground messages)
 */
async function displayLocalNotification(title: string, body: string, data?: any) {
  try {
    console.log('Displaying foreground notification:', { title, body });

    // Show an in-app alert when notification arrives in foreground
    Alert.alert(
      title,
      body,
      [
        { text: 'Dismiss', style: 'cancel' },
        {
          text: 'View',
          onPress: () => {
            // Navigate to the deep link if provided
            const deepLink = data?.deep_link;
            if (deepLink) {
              handleDeepLink(deepLink);
            }
          },
        },
      ],
      { cancelable: true }
    );
  } catch (e) {
    console.error('Failed to display local notification:', e);
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
    console.log('Foreground notification received:', remoteMessage);

    // Display the notification even when app is in foreground
    const notification = remoteMessage.notification;
    if (notification) {
      await displayLocalNotification(
        notification.title || 'New Notification',
        notification.body || '',
        remoteMessage.data
      );
    }
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
