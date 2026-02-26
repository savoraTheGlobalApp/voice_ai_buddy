import { Stack } from 'expo-router';

export default function SacredStoriesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0a0a0a',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: '700',
          color: '#fff',
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
    </Stack>
  );
}
