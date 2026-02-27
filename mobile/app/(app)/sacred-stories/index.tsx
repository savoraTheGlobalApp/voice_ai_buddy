import { useRef, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useStaticStories } from '../../../src/hooks/useStaticStories';
import { useTheme } from '../../../src/contexts/ThemeContext';
import type { ThemeColors } from '../../../src/theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = 140;
const CARD_HEIGHT = 200;
const HERO_HEIGHT = 340;

// Category display config: label, gradient colors, cover emoji
const CATEGORY_CONFIG: Record<string, { label: string; gradient: [string, string]; emoji: string }> = {
  mahabharata:   { label: 'Mahabharata',      gradient: ['#7c3aed', '#2e1065'], emoji: '⚔️' },
  ramayana:      { label: 'Ramayana',          gradient: ['#b45309', '#431407'], emoji: '🏹' },
  habits:        { label: 'Daily Habits',      gradient: ['#0891b2', '#0c1a2e'], emoji: '🌱' },
  emotions:      { label: 'Emotions',          gradient: ['#db2777', '#4a0020'], emoji: '❤️' },
  moral_values:  { label: 'Moral Values',      gradient: ['#15803d', '#052e16'], emoji: '🌟' },
};

/** Convert a portrait Cloudinary URL (ar_9:16) to landscape (ar_16:9) for the hero banner. */
function toHeroUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.includes('ar_9:16') ? url.replace('ar_9:16', 'ar_16:9') : url;
}

function getCategoryConfig(category: string) {
  return CATEGORY_CONFIG[category] ?? {
    label: category.charAt(0).toUpperCase() + category.slice(1),
    gradient: ['#374151', '#111827'] as [string, string],
    emoji: '📖',
  };
}

interface StoryItem {
  story_id: string;
  title: { en: string; hi: string };
  category: string;
  values: string[];
  characters: string[];
  metadata: { reading_time: number; recommended_age: [number, number]; difficulty_level: string };
  segment_count: number;
  cover_image_url?: string;
}

function StoryCard({ story, onPress }: { story: StoryItem; onPress: () => void }) {
  const config = getCategoryConfig(story.category);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.card}>
      {story.cover_image_url ? (
        <View style={styles.cardGradient}>
          <Image
            source={{ uri: story.cover_image_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.cardOverlay}
          >
            <Text style={styles.cardTitle} numberOfLines={2}>{story.title.en}</Text>
            <Text style={styles.cardMeta}>{story.metadata.reading_time} min</Text>
          </LinearGradient>
        </View>
      ) : (
        <LinearGradient colors={config.gradient} style={styles.cardGradient}>
          <Text style={styles.cardEmoji}>{config.emoji}</Text>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.cardOverlay}
          >
            <Text style={styles.cardTitle} numberOfLines={2}>{story.title.en}</Text>
            <Text style={styles.cardMeta}>{story.metadata.reading_time} min</Text>
          </LinearGradient>
        </LinearGradient>
      )}
    </TouchableOpacity>
  );
}

function AddCustomStoryCard({ category }: { category: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.addCard}
      activeOpacity={0.7}
      onPress={() => router.push(`/(app)/sacred-stories/custom?category=${category}`)}
    >
      <Text style={styles.addCardPlus}>+</Text>
      <Text style={styles.addCardLabel}>Custom{'\n'}Story</Text>
    </TouchableOpacity>
  );
}

function CategoryRow({ category, stories }: { category: string; stories: StoryItem[] }) {
  const config = getCategoryConfig(category);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.categoryRow}>
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryLabel}>{config.label}</Text>
        <Text style={styles.categoryCount}>{stories.length} {stories.length === 1 ? 'story' : 'stories'}</Text>
      </View>
      <FlatList
        data={stories}
        keyExtractor={(item) => item.story_id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowContent}
        ListFooterComponent={<AddCustomStoryCard category={category} />}
        renderItem={({ item }) => (
          <StoryCard
            story={item}
            onPress={() =>
              router.push(`/(app)/sacred-stories/block-viewer?contentId=${item.story_id}`)
            }
          />
        )}
      />
    </View>
  );
}

function HeroBanner({ story }: { story: StoryItem }) {
  const config = getCategoryConfig(story.category);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dest = `/(app)/sacred-stories/block-viewer?contentId=${story.story_id}` as const;

  const heroContent = (
    <View style={styles.heroContent}>
      <View style={styles.heroBadgeRow}>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>{config.label.toUpperCase()}</Text>
        </View>
        <View style={styles.heroAgeChip}>
          <Text style={styles.heroAgeText}>
            Ages {story.metadata.recommended_age[0]}–{story.metadata.recommended_age[1]}
          </Text>
        </View>
      </View>
      <Text style={styles.heroTitle}>{story.title.en}</Text>
      <Text style={styles.heroTitleHi}>{story.title.hi}</Text>
      <View style={styles.heroValues}>
        {story.values.slice(0, 3).map((v) => (
          <View key={v} style={styles.heroValueChip}>
            <Text style={styles.heroValueText}>{v}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity style={styles.heroButton} onPress={() => router.push(dest)}>
        <Text style={styles.heroButtonText}>▶  Begin the Katha</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => router.push(dest)}>
      {story.cover_image_url ? (
        <View style={[styles.hero, { overflow: 'hidden' }]}>
          <Image
            source={{ uri: toHeroUrl(story.cover_image_url) }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)', colors.background]}
            style={StyleSheet.absoluteFill}
          />
          {heroContent}
        </View>
      ) : (
        <LinearGradient colors={[config.gradient[0], config.gradient[1], colors.background]} style={styles.hero}>
          <Text style={styles.heroEmoji}>{config.emoji}</Text>
          {heroContent}
        </LinearGradient>
      )}
    </TouchableOpacity>
  );
}

function FeaturedCarousel({ stories }: { stories: StoryItem[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<StoryItem>>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = () => {
    if (stories.length <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % stories.length;
        flatListRef.current?.scrollToIndex({ animated: true, index: next });
        return next;
      });
    }, 2000);
  };

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [stories.length]);

  const onMomentumScrollEnd = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
    // Reset timer so the next auto-advance starts fresh after a manual swipe
    if (timerRef.current) clearInterval(timerRef.current);
    startTimer();
  };

  return (
    <View>
      <FlatList
        ref={flatListRef}
        data={stories}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.story_id}
        getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollToIndexFailed={() => {}}
        renderItem={({ item }) => <HeroBanner story={item} />}
      />
      {/* Dot indicators */}
      {stories.length > 1 && (
        <View style={dotsStyles.dotsRow}>
          {stories.map((_, i) => (
            <View key={i} style={[dotsStyles.dot, i === activeIndex && dotsStyles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

// Dot styles are always overlaid on image — keep as static
const dotsStyles = StyleSheet.create({
  dotsRow: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 18,
  },
});

export default function SacredStoriesLibrary() {
  const { data, isLoading, error } = useStaticStories();
  const { colors, theme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Loading stories...</Text>
      </View>
    );
  }

  if (error || !data || data.stories.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>No stories available</Text>
      </View>
    );
  }

  const { stories } = data;

  // Group stories by category
  const grouped = stories.reduce<Record<string, StoryItem[]>>((acc, story) => {
    if (!acc[story.category]) acc[story.category] = [];
    acc[story.category].push(story);
    return acc;
  }, {});

  // Only render the five active categories, in this fixed order
  const categoryOrder = ['mahabharata', 'ramayana', 'habits', 'emotions', 'moral_values'].filter((c) => grouped[c]);

  // Featured carousel: first story from each category (up to 5)
  const featuredStories = categoryOrder.map((c) => grouped[c][0]).filter(Boolean);

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={theme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={colors.background}
      />
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        {/* Auto-advancing featured carousel */}
        <FeaturedCarousel stories={featuredStories} />

        {/* Category rows */}
        <View style={styles.rows}>
          {categoryOrder.map((category) => (
            <CategoryRow key={category} category={category} stories={grouped[category]} />
          ))}

          {/* Characters link */}
          <TouchableOpacity
            style={styles.charactersRow}
            onPress={() => router.push('/(app)/sacred-stories/characters')}
            activeOpacity={0.8}
          >
            <Text style={styles.charactersEmoji}>👥</Text>
            <View>
              <Text style={styles.charactersTitle}>Character Collection</Text>
              <Text style={styles.charactersSub}>View characters you've unlocked</Text>
            </View>
            <Text style={styles.charactersArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    scroll: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      backgroundColor: c.background,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    loadingText: {
      color: c.textTertiary,
      fontSize: 15,
    },
    errorText: {
      color: '#ef4444',
      fontSize: 15,
    },

    // Hero
    hero: {
      width: SCREEN_WIDTH,
      height: HERO_HEIGHT,
      justifyContent: 'flex-end',
    },
    heroEmoji: {
      position: 'absolute',
      top: 32,
      right: 24,
      fontSize: 96,
      opacity: 0.4,
    },
    heroContent: {
      padding: 20,
      paddingBottom: 24,
    },
    heroBadgeRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    heroBadge: {
      backgroundColor: '#f97316',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 4,
    },
    heroBadgeText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
    },
    heroAgeChip: {
      backgroundColor: 'rgba(255,255,255,0.15)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 4,
    },
    heroAgeText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '600',
    },
    heroTitle: {
      color: '#fff',
      fontSize: 26,
      fontWeight: '800',
      lineHeight: 32,
      marginBottom: 4,
    },
    heroTitleHi: {
      color: 'rgba(255,255,255,0.6)',
      fontSize: 16,
      marginBottom: 12,
    },
    heroValues: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 18,
    },
    heroValueChip: {
      backgroundColor: 'rgba(255,255,255,0.15)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
    },
    heroValueText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '500',
    },
    heroButton: {
      backgroundColor: '#fff',
      alignSelf: 'flex-start',
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 6,
    },
    heroButtonText: {
      color: '#0a0a0a',
      fontSize: 14,
      fontWeight: '700',
    },

    // Category rows
    rows: {
      paddingTop: 8,
      paddingBottom: 40,
    },
    categoryRow: {
      marginBottom: 28,
    },
    categoryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      marginBottom: 10,
    },
    categoryLabel: {
      color: c.text,
      fontSize: 16,
      fontWeight: '700',
    },
    categoryCount: {
      color: c.textTertiary,
      fontSize: 13,
    },
    rowContent: {
      paddingHorizontal: 16,
      gap: 10,
    },

    // Story card
    card: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      borderRadius: 10,
      overflow: 'hidden',
    },
    cardGradient: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardEmoji: {
      fontSize: 52,
      opacity: 0.85,
      marginBottom: 20,
    },
    cardOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 10,
      paddingTop: 20,
    },
    cardTitle: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    cardMeta: {
      color: 'rgba(255,255,255,0.6)',
      fontSize: 10,
      marginTop: 2,
    },

    // Add custom story card
    addCard: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: 'rgba(249,115,22,0.4)',
      borderStyle: 'dashed',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
    },
    addCardPlus: {
      color: '#f97316',
      fontSize: 28,
      fontWeight: '300',
      lineHeight: 32,
    },
    addCardLabel: {
      color: '#f97316',
      fontSize: 11,
      fontWeight: '600',
      textAlign: 'center',
      opacity: 0.85,
    },

    // Characters row
    charactersRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginTop: 4,
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 16,
      gap: 12,
      borderWidth: 1,
      borderColor: c.surfaceBorder,
    },
    charactersEmoji: {
      fontSize: 28,
    },
    charactersTitle: {
      color: c.text,
      fontSize: 15,
      fontWeight: '600',
    },
    charactersSub: {
      color: c.textTertiary,
      fontSize: 12,
      marginTop: 2,
    },
    charactersArrow: {
      color: c.textTertiary,
      fontSize: 22,
      marginLeft: 'auto',
    },
  });
}
