/**
 * Animated cat avatar for the narrator screen.
 * - Idle: gentle float up/down
 * - Speaking: mouth opens/closes + ears twitch + soundwave dots
 */
import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';

interface Props {
  isSpeaking: boolean;
  isLoading?: boolean;
  size?: number;
}

export default function NarratorAvatar({ isSpeaking, isLoading = false, size = 160 }: Props) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const mouthAnim = useRef(new Animated.Value(0)).current;
  const earLAnim = useRef(new Animated.Value(0)).current;
  const earRAnim = useRef(new Animated.Value(0)).current;
  const loadingAnim = useRef(new Animated.Value(1)).current;
  const wave1Anim = useRef(new Animated.Value(0)).current;
  const wave2Anim = useRef(new Animated.Value(0)).current;
  const wave3Anim = useRef(new Animated.Value(0)).current;

  const floatLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const mouthLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const waveLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Gentle floating — always active
  useEffect(() => {
    floatLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -8,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    floatLoopRef.current.start();
    return () => floatLoopRef.current?.stop();
  }, []);

  // Loading pulse
  useEffect(() => {
    if (isLoading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(loadingAnim, { toValue: 0.5, duration: 500, useNativeDriver: true }),
          Animated.timing(loadingAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      loadingAnim.setValue(1);
    }
  }, [isLoading]);

  // Mouth + ear + soundwave animation while speaking
  useEffect(() => {
    mouthLoopRef.current?.stop();
    waveLoopRef.current?.stop();
    mouthLoopRef.current = null;
    waveLoopRef.current = null;

    if (!isSpeaking) {
      mouthAnim.setValue(0);
      wave1Anim.setValue(0);
      wave2Anim.setValue(0);
      wave3Anim.setValue(0);
      return;
    }

    // Mouth open/close loop
    mouthLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(mouthAnim, {
          toValue: 1,
          duration: 180,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(mouthAnim, {
          toValue: 0,
          duration: 180,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    mouthLoopRef.current.start();

    // Soundwave dots — staggered
    waveLoopRef.current = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(wave1Anim, { toValue: -6, duration: 260, useNativeDriver: true }),
          Animated.timing(wave1Anim, { toValue: 0, duration: 260, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(80),
          Animated.timing(wave2Anim, { toValue: -6, duration: 260, useNativeDriver: true }),
          Animated.timing(wave2Anim, { toValue: 0, duration: 260, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(160),
          Animated.timing(wave3Anim, { toValue: -6, duration: 260, useNativeDriver: true }),
          Animated.timing(wave3Anim, { toValue: 0, duration: 260, useNativeDriver: true }),
        ]),
      ])
    );
    waveLoopRef.current.start();

    // Occasional ear twitches
    const earTimer = setInterval(() => {
      Animated.sequence([
        Animated.timing(earLAnim, { toValue: -4, duration: 100, useNativeDriver: true }),
        Animated.timing(earLAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
        Animated.timing(earRAnim, { toValue: -4, duration: 100, useNativeDriver: true }),
        Animated.timing(earRAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      ]).start();
    }, 2800);

    return () => {
      mouthLoopRef.current?.stop();
      waveLoopRef.current?.stop();
      clearInterval(earTimer);
      mouthAnim.setValue(0);
      earLAnim.setValue(0);
      earRAnim.setValue(0);
      wave1Anim.setValue(0);
      wave2Anim.setValue(0);
      wave3Anim.setValue(0);
    };
  }, [isSpeaking]);

  const headSize = size * 0.62;
  const earSize = size * 0.20;
  const eyeSize = size * 0.10;
  const pupilSize = size * 0.055;
  const noseSize = size * 0.055;
  const mouthW = size * 0.22;
  const mouthBaseH = size * 0.035;

  const mouthScaleY = mouthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 3.5],
  });

  return (
    <Animated.View
      style={[
        { width: size, height: size + 20, alignItems: 'center' },
        { opacity: loadingAnim, transform: [{ translateY: floatAnim }] },
      ]}
    >
      {/* Left ear */}
      <Animated.View
        style={{
          width: earSize,
          height: earSize * 1.2,
          borderRadius: earSize * 0.3,
          backgroundColor: '#e8a020',
          position: 'absolute',
          top: size * 0.04,
          left: size * 0.10,
          transform: [{ rotate: '-12deg' }, { translateY: earLAnim }],
        }}
      />
      <View
        style={{
          width: earSize * 0.55,
          height: earSize * 0.7,
          borderRadius: earSize * 0.2,
          backgroundColor: '#f9c8a0',
          position: 'absolute',
          top: size * 0.07,
          left: size * 0.145,
          transform: [{ rotate: '-12deg' }],
        }}
      />

      {/* Right ear */}
      <Animated.View
        style={{
          width: earSize,
          height: earSize * 1.2,
          borderRadius: earSize * 0.3,
          backgroundColor: '#e8a020',
          position: 'absolute',
          top: size * 0.04,
          right: size * 0.10,
          transform: [{ rotate: '12deg' }, { translateY: earRAnim }],
        }}
      />
      <View
        style={{
          width: earSize * 0.55,
          height: earSize * 0.7,
          borderRadius: earSize * 0.2,
          backgroundColor: '#f9c8a0',
          position: 'absolute',
          top: size * 0.07,
          right: size * 0.145,
          transform: [{ rotate: '12deg' }],
        }}
      />

      {/* Head */}
      <View
        style={{
          width: headSize,
          height: headSize,
          borderRadius: headSize / 2,
          backgroundColor: '#f5c030',
          position: 'absolute',
          top: size * 0.12,
          left: (size - headSize) / 2,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 6,
        }}
      >
        {/* Eyes */}
        <View style={{ flexDirection: 'row', gap: headSize * 0.22, marginBottom: headSize * 0.04, marginTop: -headSize * 0.06 }}>
          {[0, 1].map((i) => (
            <View
              key={i}
              style={{
                width: eyeSize,
                height: eyeSize,
                borderRadius: eyeSize / 2,
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View style={{ width: pupilSize, height: pupilSize, borderRadius: pupilSize / 2, backgroundColor: '#2d1a00' }} />
            </View>
          ))}
        </View>

        {/* Nose */}
        <View
          style={{
            width: noseSize,
            height: noseSize * 0.65,
            borderRadius: noseSize * 0.3,
            backgroundColor: '#f97070',
            marginBottom: headSize * 0.03,
          }}
        />

        {/* Mouth */}
        <Animated.View
          style={{
            width: mouthW,
            height: mouthBaseH,
            borderRadius: mouthBaseH,
            backgroundColor: '#6b2a0a',
            transform: [{ scaleY: mouthScaleY }],
          }}
        />

        {/* Whiskers */}
        {([-1, 1] as const).map((side) =>
          [0, 1, 2].map((row) => (
            <View
              key={`w-${side}-${row}`}
              style={{
                position: 'absolute',
                width: headSize * 0.28,
                height: 1.5,
                backgroundColor: 'rgba(80,40,0,0.28)',
                top: headSize * (0.56 + row * 0.055),
                left: side === -1 ? headSize * 0.02 : headSize * 0.7,
                transform: [{ rotate: side === -1 ? `${-5 + row * 5}deg` : `${5 - row * 5}deg` }],
              }}
            />
          ))
        )}
      </View>

      {/* Soundwave dots */}
      {isSpeaking && (
        <View style={styles.waveRow}>
          {([wave1Anim, wave2Anim, wave3Anim] as Animated.Value[]).map((anim, i) => (
            <Animated.View
              key={i}
              style={[styles.waveDot, { transform: [{ translateY: anim }] }]}
            />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  waveRow: {
    position: 'absolute',
    bottom: 2,
    flexDirection: 'row',
    gap: 5,
    alignSelf: 'center',
  },
  waveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(249,115,22,0.85)',
  },
});
