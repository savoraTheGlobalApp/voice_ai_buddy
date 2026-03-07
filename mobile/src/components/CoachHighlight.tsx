import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

/**
 * Renders an animated pulsing orange border ring that overlays its parent.
 * Place inside any View/TouchableOpacity to highlight it during onboarding.
 * Uses pointerEvents="none" so touches pass through to the element below.
 */
export function PulsingRing({ borderRadius = 8 }: { borderRadius?: number }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.ring,
        { borderRadius, transform: [{ scale: pulse }] },
      ]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 2.5,
    borderColor: '#f97316',
  },
});
