import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useStaticStories } from '../../src/hooks/useStaticStories';
import RiveNarratorAvatar from '../../src/components/RiveNarratorAvatar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CATEGORIES: { key: string; label: string; emoji: string; gradient: [string, string, string] }[] = [
  { key: 'mahabharata',  label: 'Mahabharata',   emoji: '⚔️',  gradient: ['#1a0a3d', '#4a1570', '#0d0d0d'] },
  { key: 'ramayana',     label: 'Ramayana',       emoji: '🏹',  gradient: ['#3d1a00', '#8b3a0a', '#0d0d0d'] },
  { key: 'habits',       label: 'Daily Habits',   emoji: '🌱',  gradient: ['#002a3d', '#0a5070', '#0d0d0d'] },
  { key: 'emotions',     label: 'Emotions',       emoji: '❤️',  gradient: ['#3d001a', '#8b1050', '#0d0d0d'] },
  { key: 'moral_values', label: 'Moral Values',   emoji: '🌟',  gradient: ['#003d1a', '#0a7040', '#0d0d0d'] },
];

export default function PlayScreen() {
  const [selected, setSelected] = useState(CATEGORIES[0].key);
  const { data, isLoading } = useStaticStories();

  const current = CATEGORIES.find((c) => c.key === selected) ?? CATEGORIES[0];

  const categoryStories = useMemo(() => {
    if (!data?.stories) return [];
    return data.stories.filter((s: any) => s.category === selected);
  }, [data, selected]);

  const startRandom = () => {
    if (categoryStories.length === 0) return;
    const pick = categoryStories[Math.floor(Math.random() * categoryStories.length)];
    router.push(`/(app)/sacred-stories/narrator?contentId=${pick.story_id}&from=play`);
  };

  return (
    <LinearGradient colors={current.gradient} style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

        {/* Header */}
        <Text style={styles.header}>Story Time ✨</Text>

        {/* Avatar */}
        <View style={styles.avatarWrap}>
          <RiveNarratorAvatar
            isSpeaking={false}
            isLoading={false}
            size={SCREEN_WIDTH * 0.72}
          />
        </View>

        {/* Prompt */}
        <Text style={styles.prompt}>What kind of story today?</Text>

        {/* Category pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsRow}
        >
          {CATEGORIES.map((cat) => {
            const active = cat.key === selected;
            return (
              <TouchableOpacity
                key={cat.key}
                onPress={() => setSelected(cat.key)}
                style={[styles.pill, active && styles.pillActive]}
                activeOpacity={0.75}
              >
                <Text style={styles.pillEmoji}>{cat.emoji}</Text>
                <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Start button */}
        {isLoading ? (
          <ActivityIndicator color="#f97316" style={{ marginTop: 32 }} />
        ) : (
          <TouchableOpacity
            style={[styles.startBtn, categoryStories.length === 0 && styles.startBtnDisabled]}
            onPress={startRandom}
            disabled={categoryStories.length === 0}
            activeOpacity={0.85}
          >
            <Text style={styles.startBtnText}>▶  Start Story</Text>
          </TouchableOpacity>
        )}

        {/* Story count */}
        {!isLoading && (
          <Text style={styles.sub}>
            {categoryStories.length === 0
              ? 'No stories yet in this category'
              : `${categoryStories.length} ${categoryStories.length === 1 ? 'story' : 'stories'} · random pick`}
          </Text>
        )}

        {/* Browse link */}
        <TouchableOpacity
          onPress={() => router.push('/(app)/sacred-stories')}
          style={styles.browseLink}
        >
          <Text style={styles.browseLinkText}>Browse all stories →</Text>
        </TouchableOpacity>

      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, alignItems: 'center', paddingHorizontal: 20 },

  header: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 8,
    textTransform: 'uppercase',
  },

  avatarWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: SCREEN_WIDTH,
  },

  prompt: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },

  pillsRow: {
    paddingHorizontal: 4,
    gap: 8,
    paddingBottom: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  pillActive: {
    backgroundColor: '#f97316',
    borderColor: '#f97316',
  },
  pillEmoji: { fontSize: 15 },
  pillLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  pillLabelActive: {
    color: '#fff',
  },

  startBtn: {
    marginTop: 28,
    backgroundColor: '#f97316',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 32,
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  startBtnDisabled: {
    backgroundColor: 'rgba(249,115,22,0.35)',
    shadowOpacity: 0,
    elevation: 0,
  },
  startBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  sub: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },

  browseLink: {
    marginTop: 24,
    marginBottom: 8,
    padding: 8,
  },
  browseLinkText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '500',
  },
});
