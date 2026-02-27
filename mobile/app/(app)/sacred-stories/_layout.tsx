import { Stack } from 'expo-router';
import { useTheme } from '../../../src/contexts/ThemeContext';

export default function SacredStoriesLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.headerBg,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: '700',
          color: colors.text,
        },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Collection',
        }}
      />
      <Stack.Screen
        name="[storyId]"
        options={{
          title: 'Reading Story',
          presentation: 'card',
        }}
      />
      <Stack.Screen
        name="custom"
        options={{
          title: 'Create Story',
        }}
      />
      <Stack.Screen
        name="characters"
        options={{
          title: 'Character Collection',
        }}
      />
      <Stack.Screen
        name="narrator"
        options={{
          title: '',
          headerTransparent: true,
        }}
      />
    </Stack>
  );
}
