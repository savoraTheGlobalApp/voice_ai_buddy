/**
 * Animated cat avatar for the narrator screen.
 * - Idle: gentle float up/down + periodic eye blink
 * - Speaking: mouth opens/closes + ear twitches + glow ring + radio-wave rings
 */
import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';

interface Props {
  isSpeaking: boolean;
  isLoading?: boolean;
  size?: number;
}

export default function NarratorAvatar({ isSpeaking, isLoading = false, size = 160 }: Props) {
  const floatAnim    = useRef(new Animated.Value(0)).current;
  const mouthAnim    = useRef(new Animated.Value(0)).current;
  const earLAnim     = useRef(new Animated.Value(0)).current;
  const earRAnim     = useRef(new Animated.Value(0)).current;
  const loadingAnim  = useRef(new Animated.Value(1)).current;
  const eyeBlinkAnim = useRef(new Animated.Value(1)).current;
  const glowScale    = useRef(new Animated.Value(1)).current;
  const glowOpacity  = useRef(new Animated.Value(0)).current;

  // Radio-wave rings: [scale, opacity] pairs
  const ring1Scale   = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0)).current;
  const ring2Scale   = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0)).current;
  const ring3Scale   = useRef(new Animated.Value(1)).current;
  const ring3Opacity = useRef(new Animated.Value(0)).current;

  const floatLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const mouthLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const glowLoopRef  = useRef<Animated.CompositeAnimation | null>(null);
  const waveLoopRef  = useRef<Animated.CompositeAnimation | null>(null);

  // Gentle floating — always active
  useEffect(() => {
    floatLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -8, duration: 1400,
          easing: Easing.inOut(Easing.sin), useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0, duration: 1400,
          easing: Easing.inOut(Easing.sin), useNativeDriver: true,
        }),
      ])
    );
    floatLoopRef.current.start();
    return () => floatLoopRef.current?.stop();
  }, []);

  // Eye blink — always active, every ~4 s
  useEffect(() => {
    const blink = () => {
      Animated.sequence([
        Animated.timing(eyeBlinkAnim, { toValue: 0.08, duration: 40, useNativeDriver: true }),
        Animated.timing(eyeBlinkAnim, { toValue: 1, duration: 40, useNativeDriver: true }),
      ]).start();
    };
    const interval = setInterval(blink, 4000);
    return () => clearInterval(interval);
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

  // Speaking animations: mouth, glow ring, radio waves, ear twitches
  useEffect(() => {
    mouthLoopRef.current?.stop();
    glowLoopRef.current?.stop();
    waveLoopRef.current?.stop();
    mouthLoopRef.current = null;
    glowLoopRef.current = null;
    waveLoopRef.current = null;

    if (!isSpeaking) {
      mouthAnim.setValue(0);
      glowScale.setValue(1);
      glowOpacity.setValue(0);
      ring1Scale.setValue(1); ring1Opacity.setValue(0);
      ring2Scale.setValue(1); ring2Opacity.setValue(0);
      ring3Scale.setValue(1); ring3Opacity.setValue(0);
      return;
    }

    // Mouth open/close loop
    mouthLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(mouthAnim, {
          toValue: 1, duration: 180,
          easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
        Animated.timing(mouthAnim, {
          toValue: 0, duration: 180,
          easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
      ])
    );
    mouthLoopRef.current.start();

    // Glow ring pulse
    glowLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowScale, { toValue: 1.06, duration: 500, useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0.35, duration: 500, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(glowScale, { toValue: 0.97, duration: 500, useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0.1, duration: 500, useNativeDriver: true }),
        ]),
      ])
    );
    glowLoopRef.current.start();

    // Radio-wave ring helper
    const ringAnim = (scale: Animated.Value, opacity: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scale, { toValue: 1.9, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );

    waveLoopRef.current = Animated.parallel([
      ringAnim(ring1Scale, ring1Opacity, 0),
      ringAnim(ring2Scale, ring2Opacity, 300),
      ringAnim(ring3Scale, ring3Opacity, 600),
    ]);
    // Seed initial opacity so rings are visible immediately
    ring1Opacity.setValue(0.6);
    ring2Opacity.setValue(0.6);
    ring3Opacity.setValue(0.6);
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
      glowLoopRef.current?.stop();
      waveLoopRef.current?.stop();
      clearInterval(earTimer);
      mouthAnim.setValue(0);
      earLAnim.setValue(0);
      earRAnim.setValue(0);
    };
  }, [isSpeaking]);

  const headSize   = size * 0.62;
  const earSize    = size * 0.20;
  const eyeSize    = size * 0.10;
  const pupilSize  = size * 0.055;
  const noseSize   = size * 0.055;
  const mouthW     = size * 0.22;
  const mouthBaseH = size * 0.035;
  const ringSize   = headSize * 0.38;

  const mouthScaleY = mouthAnim.interpolate({
    inputRange: [0, 1], outputRange: [1, 3.5],
  });

  return (
    <Animated.View
      style={[
        { width: size, height: size + 20, alignItems: 'center' },
        { opacity: loadingAnim, transform: [{ translateY: floatAnim }] },
      ]}
    >
      {/* Glow ring — behind head */}
      <Animated.View
        style={{
          width: headSize * 1.18,
          height: headSize * 1.18,
          borderRadius: headSize * 0.59,
          backgroundColor: 'rgba(249,115,22,0.25)',
          position: 'absolute',
          top: size * 0.12 - headSize * 0.09,
          left: (size - headSize * 1.18) / 2,
          transform: [{ scale: glowScale }],
          opacity: glowOpacity,
        }}
      />

      {/* Left ear */}
      <Animated.View
        style={{
          width: earSize, height: earSize * 1.2,
          borderRadius: earSize * 0.3,
          backgroundColor: '#e8a020',
          position: 'absolute',
          top: size * 0.04, left: size * 0.10,
          transform: [{ rotate: '-12deg' }, { translateY: earLAnim }],
        }}
      />
      <View
        style={{
          width: earSize * 0.55, height: earSize * 0.7,
          borderRadius: earSize * 0.2,
          backgroundColor: '#f9c8a0',
          position: 'absolute',
          top: size * 0.07, left: size * 0.145,
          transform: [{ rotate: '-12deg' }],
        }}
      />

      {/* Right ear */}
      <Animated.View
        style={{
          width: earSize, height: earSize * 1.2,
          borderRadius: earSize * 0.3,
          backgroundColor: '#e8a020',
          position: 'absolute',
          top: size * 0.04, right: size * 0.10,
          transform: [{ rotate: '12deg' }, { translateY: earRAnim }],
        }}
      />
      <View
        style={{
          width: earSize * 0.55, height: earSize * 0.7,
          borderRadius: earSize * 0.2,
          backgroundColor: '#f9c8a0',
          position: 'absolute',
          top: size * 0.07, right: size * 0.145,
          transform: [{ rotate: '12deg' }],
        }}
      />

      {/* Head */}
      <View
        style={{
          width: headSize, height: headSize,
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
            <Animated.View
              key={i}
              style={{
                width: eyeSize, height: eyeSize,
                borderRadius: eyeSize / 2,
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scaleY: eyeBlinkAnim }],
              }}
            >
              <View style={{ width: pupilSize, height: pupilSize, borderRadius: pupilSize / 2, backgroundColor: '#2d1a00' }} />
            </Animated.View>
          ))}
        </View>

        {/* Nose */}
        <View
          style={{
            width: noseSize, height: noseSize * 0.65,
            borderRadius: noseSize * 0.3,
            backgroundColor: '#f97070',
            marginBottom: headSize * 0.03,
          }}
        />

        {/* Mouth */}
        <Animated.View
          style={{
            width: mouthW, height: mouthBaseH,
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

      {/* Radio-wave rings — right side of avatar */}
      {isSpeaking && (
        <View style={[styles.ringsContainer, { right: -ringSize * 0.2, top: size * 0.28 }]}>
          {([
            [ring1Scale, ring1Opacity],
            [ring2Scale, ring2Opacity],
            [ring3Scale, ring3Opacity],
          ] as [Animated.Value, Animated.Value][]).map(([scale, opacity], i) => (
            <Animated.View
              key={i}
              style={[
                styles.ring,
                {
                  width: ringSize, height: ringSize,
                  borderRadius: ringSize / 2,
                  position: 'absolute',
                  transform: [{ scale }],
                  opacity,
                },
              ]}
            />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ringsContainer: {
    position: 'absolute',
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    borderWidth: 2,
    borderColor: 'rgba(249,115,22,0.7)',
    backgroundColor: 'transparent',
  },
});
