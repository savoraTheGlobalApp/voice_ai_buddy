/**
 * Narrator avatar — full-body SVG creature.
 *
 * Design:
 *  - Chubby rounded head + oval body + stubby arms + curling tail
 *  - Big expressive eyes (rx constant, ry animated for blink/emotion)
 *  - Curved eyebrows animated up/down per emotion
 *  - Smile path (idle) ↔ open oval with teeth (speaking)
 *  - Rapid mouth open/close loop while speaking ("talks a lot")
 *  - Pink blush circles, intensity driven by block type
 *  - Glow halo + expanding radio-wave rings while speaking
 *  - Whole-creature float on native driver; everything else JS-thread
 *
 * Props:
 *  isSpeaking  — drives mouth, glow, rings
 *  isLoading   — opacity pulse
 *  blockType   — drives emotion expression (eyes, brows, blush)
 *  size        — base size; SVG canvas is size × size*1.44
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Ellipse, Path, G } from 'react-native-svg';

const AnimatedCircle  = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedPath    = Animated.createAnimatedComponent(Path);
const AnimatedG       = Animated.createAnimatedComponent(G);

// ── Emotion system ─────────────────────────────────────────────────────────────

type Emotion = 'excited' | 'warm' | 'thoughtful' | 'peaceful' | 'playful' | 'proud';

const BLOCK_EMOTION: Record<string, Emotion> = {
  hook:            'excited',
  story_body:      'warm',
  text:            'warm',
  reflection:      'thoughtful',
  discussion:      'thoughtful',
  blessing:        'peaceful',
  quiz:            'playful',
  value_highlight: 'proud',
  character_intro: 'excited',
};

// Eye ry scale relative to eyeRyBase (1.0 = normal, >1 = wide, <1 = sleepy)
const EMOTION_EYE: Record<Emotion, number> = {
  excited:    1.18,
  warm:       1.00,
  thoughtful: 0.60,
  peaceful:   0.38,
  playful:    1.15,
  proud:      1.00,
};

// Eyebrow translateY: negative = raised (happy/excited), positive = lowered (sad/peaceful)
const EMOTION_BROW: Record<Emotion, number> = {
  excited:    -4,
  warm:        0,
  thoughtful:  2,
  peaceful:    3,
  playful:    -3,
  proud:      -1,
};

const EMOTION_BLUSH: Record<Emotion, number> = {
  excited:    0.45,
  warm:       0.28,
  thoughtful: 0.20,
  peaceful:   0.58,
  playful:    0.40,
  proud:      0.20,
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  isSpeaking: boolean;
  isLoading?: boolean;
  blockType?: string;
  size?: number;
}

export default function NarratorAvatar({
  isSpeaking,
  isLoading = false,
  blockType,
  size = 170,
}: Props) {
  const s = size;

  // ── Animated values (all declared at top level — hooks rule) ────────────────

  // Native driver — on outer Animated.View:
  const floatAnim   = useRef(new Animated.Value(0)).current;
  const loadingAnim = useRef(new Animated.Value(1)).current;

  // JS-thread — drive SVG props (useNativeDriver: false):
  const eyeOpenAnim   = useRef(new Animated.Value(1.0)).current;   // eye ry scale
  const browY         = useRef(new Animated.Value(0)).current;     // eyebrow translateY
  const blushOpacity  = useRef(new Animated.Value(0.28)).current;
  const mouthOpenAnim = useRef(new Animated.Value(0)).current;     // 0=smile, 1=open
  const mouthRyAnim   = useRef(new Animated.Value(s * 0.030)).current; // open-mouth ry (px)
  const glowOpacity   = useRef(new Animated.Value(0)).current;
  const ring1S = useRef(new Animated.Value(1)).current;
  const ring1O = useRef(new Animated.Value(0)).current;
  const ring2S = useRef(new Animated.Value(1)).current;
  const ring2O = useRef(new Animated.Value(0)).current;
  const ring3S = useRef(new Animated.Value(1)).current;
  const ring3O = useRef(new Animated.Value(0)).current;

  const mouthLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const glowLoopRef  = useRef<Animated.CompositeAnimation | null>(null);
  const waveLoopRef  = useRef<Animated.CompositeAnimation | null>(null);
  const emotionEyeRef = useRef(1.0); // tracks current emotion eye target for blink restore

  // ── Geometry (all proportional to s) ────────────────────────────────────────

  // SVG canvas is wider than s to give rings room on the right
  const svgW  = s * 1.26;
  const topPad = s * 0.07;  // ears extend above headCY-headR; shift everything down
  const svgH  = s * 1.44 + topPad;

  const headCX = s * 0.50;
  const headCY = s * 0.41;
  const headR  = s * 0.330;

  const lEarCX = s * 0.272; const lEarCY = s * 0.095;
  const rEarCX = s * 0.728; const rEarCY = s * 0.095;

  const eyeRx     = s * 0.092;
  const eyeRyBase = s * 0.092;
  const lEyeCX = s * 0.352; const lEyeCY = s * 0.378;
  const rEyeCX = s * 0.648; const rEyeCY = s * 0.378;
  const pupilR = s * 0.054;
  const hlR    = s * 0.024;  // highlight dot

  const mouthCX = s * 0.500;
  const mouthCY = s * 0.548;
  const mouthRX = s * 0.118;

  const bodyCX = s * 0.500; const bodyCY = s * 1.078;
  const bodyRX = s * 0.268; const bodyRY = s * 0.182;

  // Radio rings: center = right edge of head
  const ringsX    = headCX + headR * 0.90;
  const ringsY    = headCY;
  const ringBaseR = s * 0.120;

  // ── Float — always active, native driver ────────────────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -9, duration: 1400,
          easing: Easing.inOut(Easing.sin), useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0, duration: 1400,
          easing: Easing.inOut(Easing.sin), useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // ── Loading pulse — native driver ────────────────────────────────────────────
  useEffect(() => {
    if (isLoading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(loadingAnim, { toValue: 0.4, duration: 500, useNativeDriver: true }),
          Animated.timing(loadingAnim, { toValue: 1,   duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      loadingAnim.setValue(1);
    }
  }, [isLoading]);

  // ── Eye blink — always active ────────────────────────────────────────────────
  useEffect(() => {
    const blink = () => {
      Animated.sequence([
        Animated.timing(eyeOpenAnim, { toValue: 0.08, duration: 45, useNativeDriver: false }),
        Animated.timing(eyeOpenAnim, { toValue: emotionEyeRef.current, duration: 65, useNativeDriver: false }),
      ]).start();
    };
    // Randomise interval slightly so it feels alive
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => { id = setTimeout(() => { blink(); schedule(); }, 3500 + Math.random() * 2500); };
    schedule();
    return () => clearTimeout(id);
  }, []);

  // ── Emotion — triggered by blockType change ──────────────────────────────────
  useEffect(() => {
    const em = BLOCK_EMOTION[blockType ?? ''] ?? 'warm';
    emotionEyeRef.current = EMOTION_EYE[em];
    Animated.parallel([
      Animated.timing(eyeOpenAnim,  { toValue: EMOTION_EYE[em],   duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: false }),
      Animated.timing(browY,        { toValue: EMOTION_BROW[em],  duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: false }),
      Animated.timing(blushOpacity, { toValue: EMOTION_BLUSH[em], duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: false }),
    ]).start();
  }, [blockType]);

  // ── Speaking animations ──────────────────────────────────────────────────────
  useEffect(() => {
    mouthLoopRef.current?.stop();
    glowLoopRef.current?.stop();
    waveLoopRef.current?.stop();

    if (!isSpeaking) {
      Animated.timing(mouthOpenAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
      Animated.timing(glowOpacity,   { toValue: 0, duration: 300, useNativeDriver: false }).start();
      ring1S.setValue(1); ring1O.setValue(0);
      ring2S.setValue(1); ring2O.setValue(0);
      ring3S.setValue(1); ring3O.setValue(0);
      return;
    }

    // Open mouth
    Animated.timing(mouthOpenAnim, { toValue: 1, duration: 180, useNativeDriver: false }).start();

    // Rapid open/close loop — "talks a lot"
    mouthLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(mouthRyAnim, { toValue: s * 0.078, duration: 148, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(mouthRyAnim, { toValue: s * 0.026, duration: 148, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    mouthLoopRef.current.start();

    // Glow halo pulse
    glowLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 0.42, duration: 480, useNativeDriver: false }),
        Animated.timing(glowOpacity, { toValue: 0.10, duration: 480, useNativeDriver: false }),
      ])
    );
    glowLoopRef.current.start();

    // Expanding radio-wave rings
    const ringAnim = (sc: Animated.Value, op: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(sc, { toValue: 2.2, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: false }),
            Animated.timing(op, { toValue: 0,   duration: 700, useNativeDriver: false }),
          ]),
          Animated.parallel([
            Animated.timing(sc, { toValue: 1,    duration: 0, useNativeDriver: false }),
            Animated.timing(op, { toValue: 0.65, duration: 0, useNativeDriver: false }),
          ]),
        ])
      );
    ring1O.setValue(0.65); ring2O.setValue(0.65); ring3O.setValue(0.65);
    waveLoopRef.current = Animated.parallel([
      ringAnim(ring1S, ring1O, 0),
      ringAnim(ring2S, ring2O, 265),
      ringAnim(ring3S, ring3O, 530),
    ]);
    waveLoopRef.current.start();

    return () => {
      mouthLoopRef.current?.stop();
      glowLoopRef.current?.stop();
      waveLoopRef.current?.stop();
    };
  }, [isSpeaking]);

  // ── Derived interpolations ───────────────────────────────────────────────────

  // Eye ry in pixels, clamped at both blink (0.08) and wide (1.18) ends
  const eyeRyAnim = eyeOpenAnim.interpolate({
    inputRange: [0.08, 1.0, 1.18],
    outputRange: [eyeRyBase * 0.06, eyeRyBase, eyeRyBase * 1.10],
    extrapolate: 'clamp',
  });

  // Smile fades out when mouth opens
  const smileOpacity = mouthOpenAnim.interpolate({
    inputRange: [0, 0.45], outputRange: [1, 0], extrapolate: 'clamp',
  });

  // Open mouth fades in
  const openMouthOpacity = mouthOpenAnim.interpolate({
    inputRange: [0.55, 1], outputRange: [0, 1], extrapolate: 'clamp',
  });

  // Ring radii interpolated from scale
  const r1R = ring1S.interpolate({ inputRange: [1, 2.2], outputRange: [ringBaseR, ringBaseR * 2.2], extrapolate: 'clamp' });
  const r2R = ring2S.interpolate({ inputRange: [1, 2.2], outputRange: [ringBaseR, ringBaseR * 2.2], extrapolate: 'clamp' });
  const r3R = ring3S.interpolate({ inputRange: [1, 2.2], outputRange: [ringBaseR, ringBaseR * 2.2], extrapolate: 'clamp' });

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Animated.View
      style={{
        width: svgW,
        height: svgH,
        opacity: loadingAnim,
        transform: [{ translateY: floatAnim }],
      }}
    >
      <Svg width={svgW} height={svgH}>
        {/* Shift entire creature down so ears aren't clipped at the top */}
        <G transform={`translate(0 ${topPad})`}>

        {/* ── Glow halo behind head ──────────────────────────────────── */}
        <AnimatedCircle
          cx={headCX} cy={headCY} r={s * 0.415}
          fill="rgba(249,115,22,0.28)"
          opacity={glowOpacity}
        />

        {/* ── Radio-wave rings (right side of head) ─────────────────── */}
        {([
          [r1R, ring1O],
          [r2R, ring2O],
          [r3R, ring3O],
        ] as const).map(([r, op], i) => (
          <AnimatedCircle
            key={i}
            cx={ringsX} cy={ringsY}
            // @ts-ignore — AnimatedInterpolation is valid here
            r={r}
            fill="none"
            stroke="rgba(249,115,22,0.75)"
            strokeWidth={2}
            opacity={op}
          />
        ))}

        {/* ── Left ear ──────────────────────────────────────────────── */}
        <G transform={`rotate(-22, ${lEarCX}, ${lEarCY})`}>
          <Ellipse cx={lEarCX} cy={lEarCY} rx={s * 0.100} ry={s * 0.134} fill="#e8a020" />
          <Ellipse cx={lEarCX} cy={lEarCY + s * 0.018} rx={s * 0.056} ry={s * 0.085} fill="#f9c8a0" />
        </G>

        {/* ── Right ear ─────────────────────────────────────────────── */}
        <G transform={`rotate(22, ${rEarCX}, ${rEarCY})`}>
          <Ellipse cx={rEarCX} cy={rEarCY} rx={s * 0.100} ry={s * 0.134} fill="#e8a020" />
          <Ellipse cx={rEarCX} cy={rEarCY + s * 0.018} rx={s * 0.056} ry={s * 0.085} fill="#f9c8a0" />
        </G>

        {/* ── Head ──────────────────────────────────────────────────── */}
        <Circle cx={headCX} cy={headCY} r={headR} fill="#f5c030" />

        {/* ── Eyebrows — translateY is a first-class RNSVG prop, safe to animate */}
        {/* @ts-ignore — Animated.Value is valid here at runtime */}
        <AnimatedG translateY={browY}>
          {/* Left brow — gentle arch */}
          <Path
            d={`M ${s * 0.258},${s * 0.292} Q ${s * 0.350},${s * 0.242} ${s * 0.442},${s * 0.280}`}
            stroke="#6b2a0a" strokeWidth={s * 0.022} strokeLinecap="round" fill="none"
          />
          {/* Right brow */}
          <Path
            d={`M ${s * 0.558},${s * 0.280} Q ${s * 0.650},${s * 0.242} ${s * 0.742},${s * 0.292}`}
            stroke="#6b2a0a" strokeWidth={s * 0.022} strokeLinecap="round" fill="none"
          />
        </AnimatedG>

        {/* ── Left eye (big, expressive) ─────────────────────────────── */}
        {/* @ts-ignore */}
        <AnimatedEllipse cx={lEyeCX} cy={lEyeCY} rx={eyeRx} ry={eyeRyAnim} fill="white" />
        <Circle cx={lEyeCX + s * 0.010} cy={lEyeCY + s * 0.010} r={pupilR} fill="#2d1a00" />
        <Circle cx={lEyeCX + s * 0.033} cy={lEyeCY - s * 0.022} r={hlR} fill="white" />

        {/* ── Right eye ─────────────────────────────────────────────── */}
        {/* @ts-ignore */}
        <AnimatedEllipse cx={rEyeCX} cy={rEyeCY} rx={eyeRx} ry={eyeRyAnim} fill="white" />
        <Circle cx={rEyeCX + s * 0.010} cy={rEyeCY + s * 0.010} r={pupilR} fill="#2d1a00" />
        <Circle cx={rEyeCX + s * 0.033} cy={rEyeCY - s * 0.022} r={hlR} fill="white" />

        {/* ── Blush circles ─────────────────────────────────────────── */}
        {/* @ts-ignore */}
        <AnimatedEllipse cx={s * 0.232} cy={s * 0.490} rx={s * 0.092} ry={s * 0.058} fill="rgb(255,105,105)" opacity={blushOpacity} />
        {/* @ts-ignore */}
        <AnimatedEllipse cx={s * 0.768} cy={s * 0.490} rx={s * 0.092} ry={s * 0.058} fill="rgb(255,105,105)" opacity={blushOpacity} />

        {/* ── Nose ──────────────────────────────────────────────────── */}
        <Ellipse cx={s * 0.500} cy={s * 0.482} rx={s * 0.038} ry={s * 0.025} fill="#f97070" />

        {/* ── Whiskers (2 per side) ─────────────────────────────────── */}
        {[
          [s*0.160, s*0.492, s*0.320, s*0.492,  -5],
          [s*0.155, s*0.516, s*0.316, s*0.516,   5],
          [s*0.684, s*0.492, s*0.840, s*0.492,   5],
          [s*0.684, s*0.516, s*0.845, s*0.516,  -5],
        ].map(([x1, y1, x2, y2, angle], i) => (
          <Path
            key={i}
            d={`M ${x1},${y1} L ${x2},${y2}`}
            stroke="rgba(80,40,0,0.22)"
            strokeWidth={1.5}
            strokeLinecap="round"
            transform={`rotate(${angle} ${(x1 + x2) / 2} ${(y1 + y2) / 2})`}
          />
        ))}

        {/* ── Mouth: idle smile ─────────────────────────────────────── */}
        {/* @ts-ignore */}
        <AnimatedPath
          d={`M ${s * 0.368},${mouthCY} Q ${mouthCX},${s * 0.622} ${s * 0.632},${mouthCY}`}
          stroke="#6b2a0a" strokeWidth={s * 0.028} strokeLinecap="round" fill="none"
          opacity={smileOpacity}
        />

        {/* ── Mouth: open oval (speaking) ───────────────────────────── */}
        {/* @ts-ignore */}
        <AnimatedEllipse
          cx={mouthCX} cy={mouthCY}
          rx={mouthRX} ry={mouthRyAnim}
          fill="#6b2a0a"
          opacity={openMouthOpacity}
        />
        {/* Teeth strip — inside open mouth */}
        {/* @ts-ignore */}
        <AnimatedEllipse
          cx={mouthCX} cy={mouthCY - s * 0.008}
          rx={mouthRX * 0.78} ry={s * 0.018}
          fill="white"
          opacity={openMouthOpacity}
        />

        {/* ── Body (oval torso) ─────────────────────────────────────── */}
        <Ellipse cx={bodyCX} cy={bodyCY} rx={bodyRX} ry={bodyRY} fill="#f5c030" />
        {/* Belly highlight patch */}
        <Ellipse
          cx={bodyCX} cy={bodyCY + s * 0.022}
          rx={bodyRX * 0.54} ry={bodyRY * 0.60}
          fill="#f9d86a"
        />

        {/* ── Left arm (stubby, angled outward) ────────────────────── */}
        <G transform={`rotate(30, ${s * 0.192}, ${s * 1.056})`}>
          <Ellipse cx={s * 0.192} cy={s * 1.056} rx={s * 0.074} ry={s * 0.142} fill="#e8a020" />
          {/* Paw hint */}
          <Ellipse cx={s * 0.192} cy={s * 1.192} rx={s * 0.062} ry={s * 0.042} fill="#f5c030" />
        </G>

        {/* ── Right arm ─────────────────────────────────────────────── */}
        <G transform={`rotate(-30, ${s * 0.808}, ${s * 1.056})`}>
          <Ellipse cx={s * 0.808} cy={s * 1.056} rx={s * 0.074} ry={s * 0.142} fill="#e8a020" />
          {/* Paw hint */}
          <Ellipse cx={s * 0.808} cy={s * 1.192} rx={s * 0.062} ry={s * 0.042} fill="#f5c030" />
        </G>

        {/* ── Tail (right side of body, curling upward) ─────────────── */}
        <Path
          d={`M ${s * 0.742},${s * 1.082} C ${s * 0.830},${s * 1.152} ${s * 0.905},${s * 1.020} ${s * 0.882},${s * 0.910}`}
          stroke="#e8a020"
          strokeWidth={s * 0.072}
          strokeLinecap="round"
          fill="none"
        />
        {/* Tail tip — lighter colour */}
        <Circle cx={s * 0.882} cy={s * 0.910} r={s * 0.042} fill="#f9c050" />

        </G>{/* end topPad translate */}
      </Svg>
    </Animated.View>
  );
}
