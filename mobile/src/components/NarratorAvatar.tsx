/**
 * NarratorAvatar — full-body creature, Samsung-safe.
 *
 * All animations use Animated.View layers with useNativeDriver: true,
 * avoiding animated SVG prop bridge that crashes on some Android OEMs
 * (Samsung Galaxy A12, Mali GPU, Android 10/11).
 *
 * Layer order (bottom → top):
 *  1. Glow halo       — Animated.View, opacity
 *  2. Radio rings ×3  — Animated.View, scale + opacity
 *  3. Base static SVG — ears, head, body, arms, tail, nose, whiskers
 *  4. Eye whites ×2   — Animated.View, scaleY (blink / emotion)
 *  5. Pupils + highlights — static Svg overlay
 *  6. Eyebrows        — Animated.View, translateY
 *  7. Blush           — Animated.View, opacity
 *  8. Smile           — Animated.View, opacity
 *  9. Open mouth      — Animated.View, opacity + scaleY
 *
 * Props:
 *  isSpeaking  — drives mouth, glow, rings
 *  isLoading   — opacity pulse
 *  blockType   — drives emotion (eyes, brows, blush)
 *  size        — base size (SVG canvas: size × size*1.44)
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Ellipse, Path, G } from 'react-native-svg';

// ── Emotion system ──────────────────────────────────────────────────────────

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

// Eye scaleY: 1.0 = normal open. >1 = wide. <1 = squint. 0.06 = blink-closed.
const EMOTION_EYE: Record<Emotion, number> = {
  excited:    1.18,
  warm:       1.00,
  thoughtful: 0.60,
  peaceful:   0.38,
  playful:    1.15,
  proud:      1.00,
};

// Eyebrow translateY: negative = raised (happy), positive = lowered (calm)
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

// ── Component ───────────────────────────────────────────────────────────────

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
  const tp = s * 0.07; // topPad — ears extend above head; shift everything down

  // ── Geometry (proportional to s) ─────────────────────────────────────────

  const svgW = s * 1.26;
  const svgH = s * 1.44 + tp;

  const headCX = s * 0.50;
  const headCY = s * 0.41;
  const headR  = s * 0.330;

  const lEarCX = s * 0.272; const lEarCY = s * 0.095;
  const rEarCX = s * 0.728; const rEarCY = s * 0.095;

  const eyeRx     = s * 0.092;
  const eyeRyBase = s * 0.092; // rx == ry so scaleY squishes a circle
  const lEyeCX = s * 0.352; const lEyeCY = s * 0.378;
  const rEyeCX = s * 0.648; const rEyeCY = s * 0.378;
  const pupilR = s * 0.054;
  const hlR    = s * 0.024;

  const mouthCX    = s * 0.500;
  const mouthCY    = s * 0.548;
  const mouthRX    = s * 0.118;
  const mouthRyMax = s * 0.078; // full-open mouth ry

  const bodyCX = s * 0.500; const bodyCY = s * 1.078;
  const bodyRX = s * 0.268; const bodyRY = s * 0.182;

  // Radio-ring origin: right edge of head
  const ringsX    = headCX + headR * 0.90;
  const ringsY    = headCY;
  const ringBaseR = s * 0.120;

  // ── Animated values — ALL useNativeDriver: true ──────────────────────────

  // Outer wrapper: float (translateY) + loading (opacity) — native ✅
  const floatAnim   = useRef(new Animated.Value(0)).current;
  const loadingAnim = useRef(new Animated.Value(1)).current;

  // Eye whites: scaleY (1.0=open, 0.06=blink-closed) — native ✅
  const eyeScaleY      = useRef(new Animated.Value(1.0)).current;
  const emotionEyeRef  = useRef(1.0); // tracks emotion target for blink restore

  // Eyebrows: translateY — native ✅
  const browY = useRef(new Animated.Value(0)).current;

  // Blush: opacity — native ✅
  const blushOpacity = useRef(new Animated.Value(0.28)).current;

  // Mouth: independent opacity values (no interpolation = native driver ok ✅)
  const smileOpacity     = useRef(new Animated.Value(1)).current;
  const openMouthOpacity = useRef(new Animated.Value(0)).current;
  // mouthScaleY: 0.333 = min-open (s*0.026/s*0.078), 1.0 = max-open — native ✅
  const mouthScaleY = useRef(new Animated.Value(0.333)).current;

  // Glow halo: opacity — native ✅
  const glowOpacity = useRef(new Animated.Value(0)).current;

  // Radio rings: scale + opacity per ring — native ✅
  const ring1S = useRef(new Animated.Value(1)).current;
  const ring1O = useRef(new Animated.Value(0)).current;
  const ring2S = useRef(new Animated.Value(1)).current;
  const ring2O = useRef(new Animated.Value(0)).current;
  const ring3S = useRef(new Animated.Value(1)).current;
  const ring3O = useRef(new Animated.Value(0)).current;

  const mouthLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const glowLoopRef  = useRef<Animated.CompositeAnimation | null>(null);
  const waveLoopRef  = useRef<Animated.CompositeAnimation | null>(null);

  // ── Float — always active ─────────────────────────────────────────────────
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

  // ── Loading pulse ─────────────────────────────────────────────────────────
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

  // ── Eye blink — always active ─────────────────────────────────────────────
  useEffect(() => {
    const blink = () => {
      Animated.sequence([
        Animated.timing(eyeScaleY, { toValue: 0.06, duration: 45, useNativeDriver: true }),
        Animated.timing(eyeScaleY, { toValue: emotionEyeRef.current, duration: 65, useNativeDriver: true }),
      ]).start();
    };
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => {
      id = setTimeout(() => { blink(); schedule(); }, 3500 + Math.random() * 2500);
    };
    schedule();
    return () => clearTimeout(id);
  }, []);

  // ── Emotion — triggered by blockType ─────────────────────────────────────
  useEffect(() => {
    const em = BLOCK_EMOTION[blockType ?? ''] ?? 'warm';
    emotionEyeRef.current = EMOTION_EYE[em];
    Animated.parallel([
      Animated.timing(eyeScaleY,   { toValue: EMOTION_EYE[em],   duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(browY,       { toValue: EMOTION_BROW[em],  duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(blushOpacity,{ toValue: EMOTION_BLUSH[em], duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, [blockType]);

  // ── Speaking animations ───────────────────────────────────────────────────
  useEffect(() => {
    mouthLoopRef.current?.stop();
    glowLoopRef.current?.stop();
    waveLoopRef.current?.stop();

    if (!isSpeaking) {
      Animated.timing(smileOpacity,     { toValue: 1, duration: 200, useNativeDriver: true }).start();
      Animated.timing(openMouthOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      Animated.timing(glowOpacity,      { toValue: 0, duration: 300, useNativeDriver: true }).start();
      ring1S.setValue(1); ring1O.setValue(0);
      ring2S.setValue(1); ring2O.setValue(0);
      ring3S.setValue(1); ring3O.setValue(0);
      return;
    }

    // Crossfade smile → open mouth
    Animated.timing(smileOpacity,     { toValue: 0, duration: 180, useNativeDriver: true }).start();
    Animated.timing(openMouthOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();

    // Rapid talking loop (scaleY 0.333 ↔ 1.0)
    mouthLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(mouthScaleY, { toValue: 1.0,   duration: 148, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(mouthScaleY, { toValue: 0.333, duration: 148, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    mouthLoopRef.current.start();

    // Glow halo pulse
    glowLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 0.42, duration: 480, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.10, duration: 480, useNativeDriver: true }),
      ])
    );
    glowLoopRef.current.start();

    // Expanding radio-wave rings
    const ringAnim = (sc: Animated.Value, op: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(sc, { toValue: 2.2, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(op, { toValue: 0,   duration: 700, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(sc, { toValue: 1,    duration: 0, useNativeDriver: true }),
            Animated.timing(op, { toValue: 0.65, duration: 0, useNativeDriver: true }),
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

  // ── Position helper: center (cx, cy) in SVG-inner space → absolute style ──
  // cx/cy are coordinates inside the G translate(0, topPad) group.
  // Screen absolute = tp + cy for vertical.
  const abs = (cx: number, cy: number, w: number, h: number) => ({
    position: 'absolute' as const,
    left: cx - w / 2,
    top:  tp + cy - h / 2,
    width:  w,
    height: h,
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Animated.View
      style={{
        width: svgW,
        height: svgH,
        opacity: loadingAnim,
        transform: [{ translateY: floatAnim }],
      }}
    >
      {/* ── Layer 1: Glow halo behind head ─────────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={[
          abs(headCX, headCY, s * 0.830, s * 0.830),
          {
            borderRadius: s * 0.415,
            backgroundColor: 'rgb(249,115,22)',
            opacity: glowOpacity,
          },
        ]}
      />

      {/* ── Layer 2: Radio-wave rings ×3 ───────────────────────────────── */}
      {([
        [ring1S, ring1O],
        [ring2S, ring2O],
        [ring3S, ring3O],
      ] as const).map(([sc, op], i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            abs(ringsX, ringsY, ringBaseR * 2, ringBaseR * 2),
            {
              borderRadius: ringBaseR,
              borderWidth: 2,
              borderColor: 'rgba(249,115,22,0.85)',
              opacity: op,
              transform: [{ scale: sc }],
            },
          ]}
        />
      ))}

      {/* ── Layer 3: Base static SVG (no animated props) ────────────────── */}
      <Svg
        width={svgW}
        height={svgH}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <G transform={`translate(0 ${tp})`}>
          {/* Left ear */}
          <G transform={`rotate(-22, ${lEarCX}, ${lEarCY})`}>
            <Ellipse cx={lEarCX} cy={lEarCY} rx={s * 0.100} ry={s * 0.134} fill="#e8a020" />
            <Ellipse cx={lEarCX} cy={lEarCY + s * 0.018} rx={s * 0.056} ry={s * 0.085} fill="#f9c8a0" />
          </G>
          {/* Right ear */}
          <G transform={`rotate(22, ${rEarCX}, ${rEarCY})`}>
            <Ellipse cx={rEarCX} cy={rEarCY} rx={s * 0.100} ry={s * 0.134} fill="#e8a020" />
            <Ellipse cx={rEarCX} cy={rEarCY + s * 0.018} rx={s * 0.056} ry={s * 0.085} fill="#f9c8a0" />
          </G>
          {/* Head */}
          <Circle cx={headCX} cy={headCY} r={headR} fill="#f5c030" />
          {/* Nose */}
          <Ellipse cx={s * 0.500} cy={s * 0.482} rx={s * 0.038} ry={s * 0.025} fill="#f97070" />
          {/* Whiskers (2 per side) */}
          {[
            [s*0.160, s*0.492, s*0.320, s*0.492,  -5],
            [s*0.155, s*0.516, s*0.316, s*0.516,   5],
            [s*0.684, s*0.492, s*0.840, s*0.492,   5],
            [s*0.684, s*0.516, s*0.845, s*0.516,  -5],
          ].map(([x1, y1, x2, y2, angle], wi) => (
            <Path
              key={wi}
              d={`M ${x1},${y1} L ${x2},${y2}`}
              stroke="rgba(80,40,0,0.22)"
              strokeWidth={1.5}
              strokeLinecap="round"
              transform={`rotate(${angle} ${(x1 + x2) / 2} ${(y1 + y2) / 2})`}
            />
          ))}
          {/* Body */}
          <Ellipse cx={bodyCX} cy={bodyCY} rx={bodyRX} ry={bodyRY} fill="#f5c030" />
          {/* Belly highlight */}
          <Ellipse cx={bodyCX} cy={bodyCY + s * 0.022} rx={bodyRX * 0.54} ry={bodyRY * 0.60} fill="#f9d86a" />
          {/* Left arm */}
          <G transform={`rotate(30, ${s * 0.192}, ${s * 1.056})`}>
            <Ellipse cx={s * 0.192} cy={s * 1.056} rx={s * 0.074} ry={s * 0.142} fill="#e8a020" />
            <Ellipse cx={s * 0.192} cy={s * 1.192} rx={s * 0.062} ry={s * 0.042} fill="#f5c030" />
          </G>
          {/* Right arm */}
          <G transform={`rotate(-30, ${s * 0.808}, ${s * 1.056})`}>
            <Ellipse cx={s * 0.808} cy={s * 1.056} rx={s * 0.074} ry={s * 0.142} fill="#e8a020" />
            <Ellipse cx={s * 0.808} cy={s * 1.192} rx={s * 0.062} ry={s * 0.042} fill="#f5c030" />
          </G>
          {/* Tail */}
          <Path
            d={`M ${s * 0.742},${s * 1.082} C ${s * 0.830},${s * 1.152} ${s * 0.905},${s * 1.020} ${s * 0.882},${s * 0.910}`}
            stroke="#e8a020"
            strokeWidth={s * 0.072}
            strokeLinecap="round"
            fill="none"
          />
          <Circle cx={s * 0.882} cy={s * 0.910} r={s * 0.042} fill="#f9c050" />
        </G>
      </Svg>

      {/* ── Layer 4: Eye whites — scaleY animated for blink / emotion ──── */}
      {[
        { cx: lEyeCX, cy: lEyeCY },
        { cx: rEyeCX, cy: rEyeCY },
      ].map(({ cx, cy }, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            abs(cx, cy, eyeRx * 2, eyeRyBase * 2),
            { transform: [{ scaleY: eyeScaleY }] },
          ]}
        >
          {/* Static SVG circle (rx==ry so scaleY turns it into the right ellipse) */}
          <Svg width={eyeRx * 2} height={eyeRyBase * 2}>
            <Ellipse
              cx={eyeRx}
              cy={eyeRyBase}
              rx={eyeRx}
              ry={eyeRyBase}
              fill="white"
            />
          </Svg>
        </Animated.View>
      ))}

      {/* ── Layer 5: Pupils + highlights (static, always above eye whites) */}
      <Svg
        width={svgW}
        height={svgH}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <G transform={`translate(0 ${tp})`}>
          <Circle cx={lEyeCX + s * 0.010} cy={lEyeCY + s * 0.010} r={pupilR} fill="#2d1a00" />
          <Circle cx={lEyeCX + s * 0.033} cy={lEyeCY - s * 0.022} r={hlR}    fill="white" />
          <Circle cx={rEyeCX + s * 0.010} cy={rEyeCY + s * 0.010} r={pupilR} fill="#2d1a00" />
          <Circle cx={rEyeCX + s * 0.033} cy={rEyeCY - s * 0.022} r={hlR}    fill="white" />
        </G>
      </Svg>

      {/* ── Layer 6: Eyebrows — translateY animated for emotion ─────────── */}
      {/*
          Brow strip: y range s*0.242–s*0.292 in SVG-inner space.
          Container top = tp + s*0.220, height = s*0.120.
          Local SVG coords = original_y − s*0.220.
            s*0.292 → s*0.072 local
            s*0.242 → s*0.022 local
            s*0.280 → s*0.060 local
      */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: tp + s * 0.220,
          width: svgW,
          height: s * 0.120,
          transform: [{ translateY: browY }],
        }}
      >
        <Svg width={svgW} height={s * 0.120}>
          {/* Left brow */}
          <Path
            d={`M ${s * 0.258},${s * 0.072} Q ${s * 0.350},${s * 0.022} ${s * 0.442},${s * 0.060}`}
            stroke="#6b2a0a" strokeWidth={s * 0.022} strokeLinecap="round" fill="none"
          />
          {/* Right brow */}
          <Path
            d={`M ${s * 0.558},${s * 0.060} Q ${s * 0.650},${s * 0.022} ${s * 0.742},${s * 0.072}`}
            stroke="#6b2a0a" strokeWidth={s * 0.022} strokeLinecap="round" fill="none"
          />
        </Svg>
      </Animated.View>

      {/* ── Layer 7: Blush — opacity animated for emotion ───────────────── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0, left: 0,
          width: svgW, height: svgH,
          opacity: blushOpacity,
        }}
      >
        <Svg width={svgW} height={svgH}>
          <G transform={`translate(0 ${tp})`}>
            <Ellipse cx={s * 0.232} cy={s * 0.490} rx={s * 0.092} ry={s * 0.058} fill="rgb(255,105,105)" />
            <Ellipse cx={s * 0.768} cy={s * 0.490} rx={s * 0.092} ry={s * 0.058} fill="rgb(255,105,105)" />
          </G>
        </Svg>
      </Animated.View>

      {/* ── Layer 8: Idle smile — fades out when speaking ───────────────── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0, left: 0,
          width: svgW, height: svgH,
          opacity: smileOpacity,
        }}
      >
        <Svg width={svgW} height={svgH}>
          <G transform={`translate(0 ${tp})`}>
            <Path
              d={`M ${s * 0.368},${mouthCY} Q ${mouthCX},${s * 0.622} ${s * 0.632},${mouthCY}`}
              stroke="#6b2a0a" strokeWidth={s * 0.028} strokeLinecap="round" fill="none"
            />
          </G>
        </Svg>
      </Animated.View>

      {/* ── Layer 9: Open mouth — opacity + scaleY when speaking ────────── */}
      {/*
          View sized mouthRX*2 × mouthRyMax*2 (full-open dimensions).
          Centered at (mouthCX, mouthCY) in SVG-inner space.
          scaleY: 0.333 = s*0.026 effective ry (min), 1.0 = s*0.078 (max).
          Local SVG coords: mouth center = (mouthRX, mouthRyMax).
      */}
      <Animated.View
        pointerEvents="none"
        style={[
          abs(mouthCX, mouthCY, mouthRX * 2, mouthRyMax * 2),
          {
            opacity: openMouthOpacity,
            transform: [{ scaleY: mouthScaleY }],
          },
        ]}
      >
        <Svg width={mouthRX * 2} height={mouthRyMax * 2}>
          {/* Dark oval */}
          <Ellipse
            cx={mouthRX} cy={mouthRyMax}
            rx={mouthRX} ry={mouthRyMax}
            fill="#6b2a0a"
          />
          {/* Upper teeth strip */}
          <Ellipse
            cx={mouthRX} cy={mouthRyMax - s * 0.008}
            rx={mouthRX * 0.78} ry={s * 0.018}
            fill="white"
          />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}
