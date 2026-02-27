import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { SubscriptionProvider } from '../src/contexts/SubscriptionContext';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { initializePushNotifications } from '../src/lib/notifications';
import { apiClient } from '../src/api/client';

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { currentUser, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const notificationCleanupRef = useRef<(() => void) | null>(null);

  // Handle auth-based routing
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!currentUser && !inAuthGroup) {
      // Redirect to sign-in if not authenticated
      router.replace('/(auth)/sign-in');
    } else if (currentUser && inAuthGroup) {
      // Redirect to app if authenticated — lands on Collection (first tab)
      router.replace('/(app)/sacred-stories');
    }
  }, [currentUser, loading, segments]);

  // Initialize push notifications when user is authenticated
  useEffect(() => {
    if (!currentUser?.uid) {
      // Cleanup if user logs out
      if (notificationCleanupRef.current) {
        notificationCleanupRef.current();
        notificationCleanupRef.current = null;
      }
      return;
    }

    // Initialize notifications
    initializePushNotifications(currentUser.uid, apiClient)
      .then((cleanup) => {
        notificationCleanupRef.current = cleanup;
      })
      .catch((e) => {
        console.log('Push notification init failed (may not be available):', e);
      });

    return () => {
      if (notificationCleanupRef.current) {
        notificationCleanupRef.current();
        notificationCleanupRef.current = null;
      }
    };
  }, [currentUser?.uid]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <AuthProvider>
            <SubscriptionProvider>
              <RootLayoutNav />
            </SubscriptionProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
