import { Tabs } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import OnboardingModal from '../../src/components/OnboardingModal';
import CoachOverlay from '../../src/components/CoachOverlay';
import FeedbackSheet from '../../src/components/FeedbackSheet';
import { PulsingRing } from '../../src/components/CoachHighlight';
import { useCoachHighlight } from '../../src/contexts/OnboardingContext';

// ── Highlighted tab buttons ───────────────────────────────────────────────────

function PlayTabButton(props: any) {
  const isHighlighted = useCoachHighlight('play-tab');
  return (
    <View style={{ flex: 1 }}>
      <Pressable {...props} />
      {isHighlighted && <PulsingRing borderRadius={8} />}
    </View>
  );
}

function LibraryTabButton(props: any) {
  const isHighlighted = useCoachHighlight('library-tab');
  return (
    <View style={{ flex: 1 }}>
      <Pressable {...props} />
      {isHighlighted && <PulsingRing borderRadius={8} />}
    </View>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <>
      <OnboardingModal />
      <CoachOverlay />
      <FeedbackSheet />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.tabBarBorder,
          },
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="play"
          options={{
            title: 'Play',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="play-circle" size={size} color={color} />
            ),
            tabBarButton: (props) => <PlayTabButton {...props} />,
          }}
        />
        <Tabs.Screen
          name="sacred-stories"
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              e.preventDefault();
              navigation.navigate('sacred-stories', { screen: 'index' });
            },
          })}
          options={{
            title: 'Library',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="library-outline" size={size} color={color} />
            ),
            tabBarButton: (props) => <LibraryTabButton {...props} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}
