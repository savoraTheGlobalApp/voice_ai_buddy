import { Stack } from 'expo-router';
import { useTheme } from '../../../src/contexts/ThemeContext';

export default function SettingsLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.headerBg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700', color: colors.text },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="parent-summary" options={{ title: 'Weekly Summary' }} />
    </Stack>
  );
}
