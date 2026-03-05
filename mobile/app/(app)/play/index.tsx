import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Animated,
  PanResponder,
  BackHandler,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStaticStories } from '../../../src/hooks/useStaticStories';
import RiveNarratorAvatar from '../../../src/components/RiveNarratorAvatar';
import { useCompanion } from '../../../src/contexts/CompanionContext';
import { useSoundEffects } from '../../../src/hooks/useSoundEffects';
import { trackStoryTapped, trackStoryStarted } from '../../../src/utils/analytics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AVATAR_SIZE = SCREEN_WIDTH * 0.64;
const GLOW_SIZE   = AVATAR_SIZE * 1.25;

const CATEGORIES: {
  key: string;
  label: string;
  emoji: string;
  tagline: string;
  gradient: [string, string, string];
}[] = [
  { key: 'ramayana',     label: 'Ramayana',      emoji: '🏹',  tagline: 'The journey of dharma & devotion',   gradient: ['#3d1a00', '#8b3a0a', '#0d0d0d'] },
  { key: 'habits',       label: 'Daily Habits',  emoji: '🌱',  tagline: 'Build good habits, shape character', gradient: ['#002a3d', '#0a5070', '#0d0d0d'] },
  { key: 'emotions',     label: 'Emotions',      emoji: '❤️',  tagline: 'Learn to understand your feelings',  gradient: ['#3d001a', '#8b1050', '#0d0d0d'] },
  { key: 'moral_values', label: 'Moral Values',  emoji: '🌟',  tagline: 'Timeless wisdom for everyday life',  gradient: ['#003d1a', '#0a7040', '#0d0d0d'] },
  { key: 'mahabharata',  label: 'Mahabharata',   emoji: '⚔️',  tagline: 'Epic tales of courage & duty',       gradient: ['#1a0a3d', '#4a1570', '#0d0d0d'] },
];

const SUGGESTED_NAMES = ['Leo', 'Golu', 'Moti'];

// ── Speech bubble ─────────────────────────────────────────────────────────────
function CompanionBubble({ text, visible }: { text: string; visible: boolean }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: visible ? 1 : 0,
      duration: 300,
      delay: visible ? 400 : 0,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (!text) return null;

  return (
    <Animated.View style={[styles.bubble, { opacity: fadeAnim }]}>
      <Text style={styles.bubbleText}>{text}</Text>
      <View style={styles.bubbleTail} />
    </Animated.View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function PlayScreen() {
  const companion = useCompanion();
  const { play } = useSoundEffects();

  const [categoryIdx, setCategoryIdx] = useState(0);
  const categoryIdxRef = useRef(0);
  const { data, isLoading } = useStaticStories();

  // Bubble visibility — shown when tab is focused
  const [bubbleVisible, setBubbleVisible] = useState(false);

  // Name modal
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftChildName, setDraftChildName] = useState('');

  // ── Animated gradient cross-fade ──────────────────────────────────────────
  const gradientFade = useRef(new Animated.Value(0)).current;
  const [displayedCat, setDisplayedCat] = useState(CATEGORIES[0]);
  const [incomingCat,  setIncomingCat]  = useState(CATEGORIES[0]);

  const switchCategory = useCallback((idx: number) => {
    const newCat = CATEGORIES[idx];
    setIncomingCat(newCat);
    gradientFade.setValue(0);
    Animated.timing(gradientFade, {
      toValue: 1, duration: 600, useNativeDriver: true,
    }).start(() => {
      setDisplayedCat(newCat);
      gradientFade.setValue(0);
    });
  }, []);

  // ── Category text fade ────────────────────────────────────────────────────
  const textFade = useRef(new Animated.Value(1)).current;

  const goToCategory = useCallback((idx: number) => {
    if (idx < 0 || idx >= CATEGORIES.length) return;
    play('categorySwitch');
    categoryIdxRef.current = idx;
    Animated.timing(textFade, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setCategoryIdx(idx);
      switchCategory(idx);
      Animated.timing(textFade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
  }, [switchCategory, play]);

  // ── Swipe to change category ──────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        const cur = categoryIdxRef.current;
        if (g.dx < -40) goToCategory(Math.min(cur + 1, CATEGORIES.length - 1));
        else if (g.dx > 40) goToCategory(Math.max(cur - 1, 0));
      },
    })
  ).current;

  // ── Breathing glow ────────────────────────────────────────────────────────
  const glowAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.07, 0.26] });
  const glowScale   = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.93, 1.07] });

  // ── Focus effects ─────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      // Show greeting bubble + play tab-focus chime
      companion.refreshGreeting();
      setBubbleVisible(true);
      play('tabFocus');

      // A beat later, play the companion greeting sound
      const greetTimer = setTimeout(() => play('companionGreet'), 600);

      // Intercept Android back → exit app
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        BackHandler.exitApp();
        return true;
      });

      return () => {
        setBubbleVisible(false);
        clearTimeout(greetTimer);
        sub.remove();
      };
    }, [play])
  );

  // ── Stories ───────────────────────────────────────────────────────────────
  const current = CATEGORIES[categoryIdx];
  const categoryStories = useMemo(() => {
    if (!data?.stories) return [];
    return data.stories.filter((s: any) => s.category === current.key);
  }, [data, current.key]);

  const startRandom = () => {
    if (categoryStories.length === 0) return;
    play('startStory');
    const pick = categoryStories[Math.floor(Math.random() * categoryStories.length)];
    companion.recordStorySeen(current.key);
    trackStoryTapped(pick.story_id, current.key, 'list');
    trackStoryStarted(pick.story_id, current.key, pick.segment_count, 'en');
    // Navigate within the Play tab's own stack so the story stays "owned" by Play.
    // Switching to Library pauses audio; coming back to Play resumes the narrator screen.
    router.push(`/(app)/play/narrator?contentId=${pick.story_id}`);
  };

  const confirmName = () => {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    play('nameConfirmed');
    companion.setName(trimmed);
    const childTrimmed = draftChildName.trim();
    if (childTrimmed) companion.setChildName(childTrimmed);
    setNameModalVisible(false);
    setDraftName('');
    setDraftChildName('');
  };

  const openNameModal = () => {
    setDraftName(companion.name ?? '');
    setDraftChildName(companion.childName ?? '');
    setNameModalVisible(true);
  };

  const isFirst = categoryIdx === 0;
  const isLast  = categoryIdx === CATEGORIES.length - 1;

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      {/* Layered animated gradient */}
      <LinearGradient colors={displayedCat.gradient} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: gradientFade }]}>
        <LinearGradient colors={incomingCat.gradient} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Story Time ✨</Text>
          <TouchableOpacity
            onPress={() => router.push('/(app)/settings')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.45)" />
          </TouchableOpacity>
        </View>

        {/* Avatar section */}
        <View style={styles.avatarSection}>
          {/* Greeting bubble above avatar */}
          <CompanionBubble text={companion.greeting} visible={bubbleVisible} />

          {/* Glow ring */}
          <Animated.View
            style={[styles.glowRing, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
          />

          {/* Avatar frame */}
          <View style={styles.avatarFrame}>
            <RiveNarratorAvatar isSpeaking={false} isLoading={false} size={AVATAR_SIZE} />
          </View>

          {/* Name badge below avatar */}
          <TouchableOpacity onPress={openNameModal} style={styles.nameBadge} activeOpacity={0.75}>
            {companion.isNamed ? (
              <>
                <Text style={styles.nameBadgeText}>{companion.name}</Text>
                <Ionicons name="pencil" size={11} color="rgba(255,255,255,0.6)" />
              </>
            ) : (
              <>
                <Ionicons name="help-circle-outline" size={14} color="rgba(255,255,255,0.7)" />
                <Text style={styles.nameBadgeText}>Tap to name me</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Category navigation */}
        <View style={styles.categorySection}>
          <View style={styles.categoryNav}>
            <TouchableOpacity
              onPress={() => goToCategory(categoryIdx - 1)}
              disabled={isFirst}
              style={[styles.arrowBtn, isFirst && styles.arrowBtnDisabled]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </TouchableOpacity>

            <Animated.View style={[styles.categoryCenter, { opacity: textFade }]}>
              <Text style={styles.categoryEmoji}>{current.emoji}</Text>
              <Text style={styles.categoryLabel}>{current.label.toUpperCase()}</Text>
            </Animated.View>

            <TouchableOpacity
              onPress={() => goToCategory(categoryIdx + 1)}
              disabled={isLast}
              style={[styles.arrowBtn, isLast && styles.arrowBtnDisabled]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-forward" size={26} color="#fff" />
            </TouchableOpacity>
          </View>

          <Animated.Text style={[styles.tagline, { opacity: textFade }]}>
            {current.tagline}
          </Animated.Text>

          <View style={styles.dotsRow}>
            <View style={styles.dots}>
              {CATEGORIES.map((_, i) => (
                <TouchableOpacity key={i} onPress={() => goToCategory(i)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                  <View style={[styles.dot, i === categoryIdx && styles.dotActive]} />
                </TouchableOpacity>
              ))}
            </View>
            {!isLoading && (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>
                  {categoryStories.length} {categoryStories.length === 1 ? 'story' : 'stories'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {isLoading ? (
            <ActivityIndicator color="#f97316" size="large" />
          ) : (
            <TouchableOpacity
              style={[styles.startBtn, categoryStories.length === 0 && styles.startBtnDisabled]}
              onPress={startRandom}
              disabled={categoryStories.length === 0}
              activeOpacity={0.85}
            >
              <Ionicons name="play" size={22} color="#fff" />
              <Text style={styles.startBtnText}>Start Story</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => router.push('/(app)/sacred-stories')} style={styles.browseLink}>
            <Text style={styles.browseLinkText}>Browse all stories →</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>

      {/* Name modal */}
      <Modal visible={nameModalVisible} transparent animationType="slide" onRequestClose={() => setNameModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setNameModalVisible(false)} />
          <View style={styles.sheet}>
            {/* Small avatar */}
            <View style={styles.sheetAvatar}>
              <RiveNarratorAvatar isSpeaking={false} isLoading={false} size={80} />
            </View>

            <Text style={styles.sheetTitle}>What should you call me?</Text>

            {/* Suggested names */}
            <View style={styles.suggestionsRow}>
              {SUGGESTED_NAMES.map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => { play('nameSelect'); setDraftName(n); }}
                  style={[styles.suggestion, draftName === n && styles.suggestionActive]}
                >
                  <Text style={[styles.suggestionText, draftName === n && styles.suggestionTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Text input for companion name */}
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Type your own name..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              maxLength={12}
              style={styles.nameInput}
              autoCorrect={false}
            />

            {/* Divider */}
            <View style={styles.sheetDivider} />
            <Text style={styles.sheetSubtitle}>And what's your name?</Text>

            {/* Text input for child name */}
            <TextInput
              value={draftChildName}
              onChangeText={setDraftChildName}
              placeholder="e.g. Arjun, Priya..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              maxLength={16}
              style={styles.nameInput}
              autoCorrect={false}
            />

            {/* Confirm */}
            <TouchableOpacity
              onPress={confirmName}
              disabled={!draftName.trim()}
              style={[styles.confirmBtn, !draftName.trim() && styles.confirmBtnDisabled]}
            >
              <Text style={styles.confirmText}>Let's go! ▶</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 24 },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  headerTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },

  // Avatar section
  avatarSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 8,
    paddingBottom: 12,
  },

  // Speech bubble
  bubble: {
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: SCREEN_WIDTH - 64,
    alignSelf: 'center',
  },
  bubbleText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  bubbleTail: {
    position: 'absolute',
    bottom: -7,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(255,255,255,0.2)',
  },

  glowRing: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    backgroundColor: 'rgba(249,115,22,0.55)',
  },
  avatarFrame: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Name badge
  nameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  nameBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  // Category section
  categorySection: { alignItems: 'center', marginBottom: 8 },
  categoryNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  arrowBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  arrowBtnDisabled: { opacity: 0.25 },
  categoryCenter: { alignItems: 'center', gap: 4 },
  categoryEmoji: { fontSize: 28 },
  categoryLabel: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 2 },
  tagline: {
    color: 'rgba(255,255,255,0.55)', fontSize: 14,
    fontWeight: '400', textAlign: 'center', marginBottom: 14, fontStyle: 'italic',
  },
  dotsRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', width: '100%',
  },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { width: 18, backgroundColor: '#f97316' },
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  countText: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '600' },

  // Actions
  actions: { alignItems: 'center', marginBottom: 8, gap: 16 },
  startBtn: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10,
    backgroundColor: '#f97316', paddingVertical: 16, borderRadius: 32,
    shadowColor: '#f97316', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5, shadowRadius: 14, elevation: 10,
  },
  startBtnDisabled: { backgroundColor: 'rgba(249,115,22,0.3)', shadowOpacity: 0, elevation: 0 },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  browseLink: { padding: 4 },
  browseLinkText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '500' },

  // Name modal
  modalBackdrop: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, alignItems: 'center', gap: 16,
    borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  sheetAvatar: {
    width: 90, height: 90, borderRadius: 45,
    overflow: 'hidden', borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  sheetTitle: {
    color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center',
  },
  sheetDivider: {
    width: '100%', height: 1, backgroundColor: 'rgba(255,255,255,0.1)',
  },
  sheetSubtitle: {
    color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600', textAlign: 'center',
  },
  suggestionsRow: { flexDirection: 'row', gap: 12 },
  suggestion: {
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 24, borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  suggestionActive: { backgroundColor: '#f97316', borderColor: '#f97316' },
  suggestionText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600' },
  suggestionTextActive: { color: '#fff' },
  nameInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16, paddingVertical: 12,
    color: '#fff', fontSize: 15, textAlign: 'center',
  },
  confirmBtn: {
    width: '100%', backgroundColor: '#f97316',
    paddingVertical: 14, borderRadius: 28,
    alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: 'rgba(249,115,22,0.3)' },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
