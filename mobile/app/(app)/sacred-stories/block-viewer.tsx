import { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useBlockContent, useUpdateProgress } from '../../../src/hooks/useStaticStories';
import {
  trackStoryStarted,
  trackSlideViewed,
  trackStoryLanguageSwitched,
  trackStoryCompleted,
  trackStoryAbandoned,
  trackNarratorButtonTapped,
} from '../../../src/utils/analytics';
import { useFocusEffect } from 'expo-router';
import { createSampleBlockContent } from '../../../src/utils/storyToBlocks';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { useSoundEffects } from '../../../src/hooks/useSoundEffects';
import type { SoundName } from '../../../src/hooks/useSoundEffects';
import type { BlockBasedContent, ContentBlock } from '../../../src/types/stories';

type PlayFn = (name: SoundName) => void;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type Language = 'en' | 'hi';

// ── Category fallback config ─────────────────────────────────────────────────

const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  mahabharata:  ['#7c3aed', '#2e1065'],
  ramayana:     ['#b45309', '#431407'],
  krishna:      ['#0369a1', '#0c1a2e'],
  panchatantra: ['#15803d', '#052e16'],
  ganesha:      ['#be185d', '#4a0020'],
  upanishads:   ['#b45309', '#292524'],
};

const CATEGORY_EMOJI: Record<string, string> = {
  mahabharata:  '⚔️',
  ramayana:     '🏹',
  krishna:      '🦚',
  panchatantra: '🐾',
  ganesha:      '🐘',
  upanishads:   '🕉️',
};

function getCategoryGradient(category: string): [string, string] {
  return CATEGORY_GRADIENTS[category] ?? ['#374151', '#111827'];
}

function getCategoryEmoji(category: string): string {
  return CATEGORY_EMOJI[category] ?? '📖';
}

// ── Slide helpers ────────────────────────────────────────────────────────────

const SKIP_TYPES = new Set(['divider', 'audio', 'image']);

const BLOCK_LABELS: Record<string, string> = {
  hook:            'Opening',
  story_body:      'The Story',
  reflection:      'Reflect',
  blessing:        'Blessing',
  discussion:      "Let's Talk",
  quiz:            'Quick Check',
  value_highlight: 'Values',
};

function getSlideText(block: ContentBlock, language: Language): string {
  const b = block as any;
  switch (block.type) {
    case 'hook':
    case 'text':
    case 'story_body':
    case 'blessing':
      return b.content?.[language] ?? '';
    case 'reflection':
    case 'discussion':
      return b.question?.[language] ?? '';
    case 'quiz':
      return b.question?.[language] ?? '';
    case 'value_highlight':
      return b.explanation?.[language] ?? '';
    case 'character_intro':
      return b.name?.[language] ?? '';
    default:
      return '';
  }
}

function getBlockLabel(block: ContentBlock): string {
  if (block.type === 'character_intro') {
    return (block as any).name?.en ?? 'Character';
  }
  return BLOCK_LABELS[block.type] ?? '';
}

/** Keep first 2 sentences, max 200 chars. Handles Hindi full stops (।). */
function truncateToSentences(text: string, maxLen = 200): string {
  if (text.length <= maxLen) return text;
  const sentences = text.match(/[^.!?।]+[.!?।]+/g) ?? [];
  let result = '';
  for (const s of sentences) {
    if (result.length > 0 && (result + s).length > maxLen) break;
    result += s;
  }
  return result.trim() || text.slice(0, maxLen).trim() + '…';
}

// ── Ken Burns directions (cycle per slide index) ─────────────────────────────

const KB_DIRECTIONS = [
  { x: -10, y: -10 },
  { x:  10, y:  10 },
  { x:  10, y: -10 },
  { x: -10, y:  10 },
] as const;

// ── SlideProgressBar ─────────────────────────────────────────────────────────

function SlideProgressBar({ total, current }: { total: number; current: number }) {
  return (
    <View style={slideStyles.progressBar}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            slideStyles.progressSegment,
            i <= current
              ? slideStyles.progressSegmentActive
              : slideStyles.progressSegmentInactive,
          ]}
        />
      ))}
    </View>
  );
}

// ── VisualSlide ──────────────────────────────────────────────────────────────

interface VisualSlideProps {
  block: ContentBlock;
  slideIndex: number;
  isActive: boolean;
  isLast: boolean;
  language: Language;
  coverUrl?: string;
  category: string;
  onToggleLang: () => void;
  onFinish: () => void;
}

const VisualSlide = memo(function VisualSlide({
  block,
  slideIndex,
  isActive,
  isLast,
  language,
  coverUrl,
  category,
  onToggleLang,
  onFinish,
}: VisualSlideProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const dir = KB_DIRECTIONS[slideIndex % KB_DIRECTIONS.length];

  useEffect(() => {
    if (isActive) {
      scaleAnim.setValue(1);
      panX.setValue(0);
      panY.setValue(0);
      const anim = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scaleAnim, { toValue: 1.08, duration: 8000, useNativeDriver: true }),
            Animated.timing(scaleAnim, { toValue: 1.0, duration: 8000, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(panX, { toValue: dir.x, duration: 8000, useNativeDriver: true }),
            Animated.timing(panX, { toValue: 0, duration: 8000, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(panY, { toValue: dir.y, duration: 8000, useNativeDriver: true }),
            Animated.timing(panY, { toValue: 0, duration: 8000, useNativeDriver: true }),
          ]),
        ])
      );
      animRef.current = anim;
      anim.start();
    } else {
      animRef.current?.stop();
    }
    return () => { animRef.current?.stop(); };
  }, [isActive]);

  const text = truncateToSentences(getSlideText(block, language));
  const label = getBlockLabel(block);
  const gradient = getCategoryGradient(category);

  const kbTransform = [
    { scale: scaleAnim },
    { translateX: panX },
    { translateY: panY },
  ];

  return (
    <View style={slideStyles.slide}>
      {/* Full-screen background (image or gradient) with Ken Burns */}
      {coverUrl ? (
        <Animated.Image
          source={{ uri: coverUrl }}
          style={[StyleSheet.absoluteFill, { transform: kbTransform }]}
          resizeMode="cover"
        />
      ) : (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: kbTransform }]}>
          <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />
          <View style={slideStyles.fallbackCenter}>
            <Text style={slideStyles.fallbackEmoji}>{getCategoryEmoji(category)}</Text>
          </View>
        </Animated.View>
      )}

      {/* Dark gradient overlay: transparent top → opaque black at bottom */}
      <LinearGradient
        colors={['rgba(0,0,0,0.05)', 'transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
        locations={[0, 0.3, 0.65, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Bottom: text overlay */}
      <SafeAreaView edges={['bottom']} style={slideStyles.bottomArea}>
        {label ? (
          <Text style={slideStyles.blockLabel}>{label.toUpperCase()}</Text>
        ) : null}

        <Text
          style={[
            slideStyles.slideText,
            language === 'hi' && slideStyles.slideTextHi,
          ]}
        >
          {text}
        </Text>

        <View style={slideStyles.actionsRow}>
          <TouchableOpacity onPress={onToggleLang} style={slideStyles.langPill}>
            <Text style={slideStyles.langPillText}>
              {language === 'en' ? '🇮🇳 हिं' : '🇬🇧 EN'}
            </Text>
          </TouchableOpacity>

          {isLast && (
            <TouchableOpacity onPress={onFinish} style={slideStyles.finishBtn}>
              <Text style={slideStyles.finishBtnText}>
                {language === 'en' ? 'Finish ✓' : 'समाप्त ✓'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
});

// ── VisualStorySlides ────────────────────────────────────────────────────────

interface VisualStorySlidesProps {
  content: BlockBasedContent;
  storyId: string;
  language: Language;
  onToggleLang: () => void;
  onComplete: () => void;
  onSlideChange: (index: number) => void;
  play: PlayFn;
}

function VisualStorySlides({
  content,
  storyId,
  language,
  onToggleLang,
  onComplete,
  onSlideChange,
  play,
}: VisualStorySlidesProps) {
  const slides = useMemo(
    () => content.blocks.filter((b: ContentBlock) => !SKIP_TYPES.has(b.type)),
    [content.blocks]
  );
  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const slideEnterTimeRef = useRef(Date.now());

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveSlide(viewableItems[0].index ?? 0);
    }
  }, []);

  const onMomentumScrollEnd = useCallback((e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    const timeSpentMs = Date.now() - slideEnterTimeRef.current;
    const prevSlide = slides[currentSlide];
    if (prevSlide) {
      trackSlideViewed(storyId, content.category, currentSlide, prevSlide.type, timeSpentMs);
    }
    slideEnterTimeRef.current = Date.now();
    setCurrentSlide(index);
    onSlideChange(index);
    play('categorySwitch');
  }, [play, storyId, content.category, currentSlide, slides, onSlideChange]);

  const coverUrl = content.cover_image_url;
  const category = content.category;
  const totalSlides = slides.length;

  const renderItem = useCallback(({ item, index }: { item: ContentBlock; index: number }) => (
    <VisualSlide
      block={item}
      slideIndex={index}
      isActive={index === activeSlide}
      isLast={index === totalSlides - 1}
      language={language}
      coverUrl={coverUrl}
      category={category}
      onToggleLang={onToggleLang}
      onFinish={onComplete}
    />
  ), [activeSlide, totalSlides, language, coverUrl, category, onToggleLang, onComplete]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        renderItem={renderItem}
      />
      {/* Progress bar overlay — rendered once, not inside every slide */}
      <SafeAreaView edges={['top']} style={slideStyles.progressOverlay} pointerEvents="none">
        <SlideProgressBar total={totalSlides} current={currentSlide} />
      </SafeAreaView>
    </View>
  );
}

// ── BlockViewerScreen ────────────────────────────────────────────────────────

export default function BlockViewerScreen() {
  const { contentId, experimentId, variantOverride } = useLocalSearchParams<{
    contentId?: string;
    experimentId?: string;
    variantOverride?: string;
  }>();
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const { top: safeTop } = useSafeAreaInsets();

  const storyId = contentId || 'maha-001';
  const [language, setLanguage] = useState<Language>('en');
  const [useFallback, setUseFallback] = useState(false);
  const { play } = useSoundEffects();
  const updateProgress = useUpdateProgress();

  // Refs for abandoned/completion tracking
  const completedRef = useRef(false);
  const openingNarratorRef = useRef(false);
  const currentSlideRef = useRef(0);
  const storyStartTimeRef = useRef(Date.now());

  const { data: content, isLoading, error, refetch } = useBlockContent({
    storyId,
    userId: currentUser?.uid,
    experimentId,
    variantOverride,
  });

  const displayContent = useFallback ? createSampleBlockContent() : content;

  useEffect(() => {
    if (error && !useFallback) {
      setUseFallback(true);
    }
  }, [error, useFallback]);

  // Track story_started — fires once when content loads
  useEffect(() => {
    if (currentUser?.uid && displayContent) {
      updateProgress.mutate({
        userId: currentUser.uid,
        storyId,
        currentSegment: 0,
        status: 'in_progress',
      });
      const totalSlides = displayContent.blocks?.filter((b: any) => !SKIP_TYPES.has(b.type)).length ?? 0;
      trackStoryStarted(storyId, displayContent.category, totalSlides, language);
      completedRef.current = false;
      storyStartTimeRef.current = Date.now();
    }
  }, [storyId, !!displayContent, currentUser?.uid]);

  // Track story_abandoned when screen loses focus without completing
  useFocusEffect(useCallback(() => {
    openingNarratorRef.current = false; // reset on re-focus so a real abandon after returning fires
    return () => {
      if (!completedRef.current && !openingNarratorRef.current && displayContent && currentSlideRef.current > 0) {
        const totalSlides = displayContent.blocks?.filter((b: any) => !SKIP_TYPES.has(b.type)).length ?? 1;
        const completionPct = Math.round((currentSlideRef.current / (totalSlides - 1)) * 100);
        trackStoryAbandoned(storyId, displayContent.category, currentSlideRef.current, completionPct);
      }
    };
  }, [storyId, displayContent]));

  const toggleLanguage = useCallback(() => {
    play('nameSelect');
    setLanguage((prev) => {
      const next = prev === 'en' ? 'hi' : 'en';
      trackStoryLanguageSwitched(storyId, prev, next, currentSlideRef.current);
      return next;
    });
  }, [play, storyId]);

  const handleComplete = useCallback(() => {
    completedRef.current = true;
    if (currentUser?.uid && displayContent) {
      const blocks = displayContent.blocks?.filter((b: any) => !SKIP_TYPES.has(b.type)) ?? [];
      updateProgress.mutate({
        userId: currentUser.uid,
        storyId,
        currentSegment: Math.max(0, blocks.length - 1),
        status: 'completed',
      });
      const totalTimeSec = Math.round((Date.now() - storyStartTimeRef.current) / 1000);
      trackStoryCompleted(storyId, displayContent.category, totalTimeSec, currentSlideRef.current + 1);
    }
    play('nameConfirmed');
    router.back();
  }, [play, currentUser?.uid, storyId, displayContent]);



  if (isLoading && !useFallback) {
    return (
      <View style={[styles.slidesRoot, { backgroundColor: colors.background }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#f97316" />
          <Text style={[styles.loadingText, { color: colors.textTertiary }]}>Loading...</Text>
        </View>
      </View>
    );
  }

  if (!displayContent) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Content not found</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => { setUseFallback(false); refetch(); }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.retryButton, styles.backButton]}
            onPress={() => router.back()}
          >
            <Text style={styles.retryText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // All stories use visual slides format
  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerTransparent: true,
          headerBackTitle: '',
        }}
      />
      <View style={styles.slidesRoot}>
        <VisualStorySlides
          content={displayContent}
          storyId={storyId}
          language={language}
          onToggleLang={toggleLanguage}
          onComplete={handleComplete}
          onSlideChange={(index) => { currentSlideRef.current = index; }}
          play={play}
        />
        {/* Narrator button — positioned above bottom actions, clear of header */}
        <TouchableOpacity
          onPress={() => {
            play('tabFocus');
            openingNarratorRef.current = true;
            trackNarratorButtonTapped(storyId, displayContent.category);
            router.push(`/(app)/sacred-stories/narrator?contentId=${storyId}`);
          }}
          style={[styles.narratorBtn, { top: safeTop + 60 }]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="headset-outline" size={20} color="#fff" />
          <Text style={styles.narratorBtnLabel}>Listen</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

// ── Slide styles ──────────────────────────────────────────────────────────────

const slideStyles = StyleSheet.create({
  slide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  fallbackCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackEmoji: {
    fontSize: 120,
    opacity: 0.4,
  },
  topArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  progressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  progressBar: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 5,
  },
  progressSegment: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
  },
  progressSegmentActive: {
    backgroundColor: '#ffffff',
  },
  progressSegmentInactive: {
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  bottomArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 60,
  },
  blockLabel: {
    color: '#f97316',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.5,
    marginBottom: 10,
  },
  slideText: {
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 30,
    fontWeight: '500',
    marginBottom: 24,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  slideTextHi: {
    fontSize: 22,
    lineHeight: 34,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  langPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  langPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  finishBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 22,
  },
  finishBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});

// ── Screen-level styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  slidesRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  narratorBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  narratorBtnLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff7ed',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#f97316',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  backButton: {
    backgroundColor: '#6b7280',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  langToggle: {
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  langToggleText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  experimentBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#fcd34d',
  },
  experimentText: {
    fontSize: 10,
    color: '#92400e',
    fontFamily: 'monospace',
    textAlign: 'center',
  },
});
