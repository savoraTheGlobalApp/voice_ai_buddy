import { Stack } from 'expo-router';

export default function SacredStoriesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#f97316', // Saffron orange
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Sacred Stories',
          headerTitle: 'Sacred Stories 📖',
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
        name="characters"
        options={{
          title: 'Character Collection',
          headerTitle: 'Character Collection 👥',
        }}
      />
    </Stack>
  );
}
