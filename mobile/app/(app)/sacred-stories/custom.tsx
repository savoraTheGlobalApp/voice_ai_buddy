import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGenerateStory } from '../../../src/hooks/useStories';
import { useSubscription } from '../../../src/contexts/SubscriptionContext';
import Paywall from '../../../src/components/Paywall';
import { SUGGESTED_TOPICS, SUGGESTED_VALUES, StoryRequest } from '../../../src/types/stories';
import { useTheme } from '../../../src/contexts/ThemeContext';
import type { ThemeColors } from '../../../src/theme/colors';

type StoryLength = 'short' | 'medium' | 'long';

// Category-specific topic suggestions shown first
const CATEGORY_TOPICS: Record<string, string[]> = {
  habits:       ['bedtime routine', 'healthy eating', 'morning routine', 'exercise', 'mindfulness'],
  emotions:     ['feeling scared', 'feeling angry', 'feeling lonely', 'jealousy', 'gratitude'],
  mahabharata:  ['dharma', 'duty', 'loyalty', 'bravery', 'sacrifice'],
  ramayana:     ['devotion', 'faith', 'courage', 'righteousness', 'family'],
  moral_values: ['honesty', 'kindness', 'sharing', 'respect', 'fairness'],
};

const CATEGORY_LABELS: Record<string, string> = {
  mahabharata:  'Mahabharata',
  ramayana:     'Ramayana',
  habits:       'Daily Habits',
  emotions:     'Emotions',
  moral_values: 'Moral Values',
};

function ChipSelector({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string;
  items: string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipContainer}>
        {items.map((item) => {
          const isSelected = selected.includes(item);
          return (
            <TouchableOpacity
              key={item}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onToggle(item)}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function LengthSelector({
  value,
  onChange,
}: {
  value: StoryLength;
  onChange: (l: StoryLength) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const options: { value: StoryLength; label: string; desc: string }[] = [
    { value: 'short',  label: 'Short',  desc: '3 parts' },
    { value: 'medium', label: 'Medium', desc: '5 parts' },
    { value: 'long',   label: 'Long',   desc: '7 parts' },
  ];
  return (
    <View style={styles.section}>
      <Text style={styles.label}>Length</Text>
      <View style={styles.lengthRow}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.lengthOption, value === opt.value && styles.lengthOptionSelected]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[styles.lengthLabel, value === opt.value && styles.lengthLabelSelected]}>
              {opt.label}
            </Text>
            <Text style={[styles.lengthDesc, value === opt.value && styles.lengthDescSelected]}>
              {opt.desc}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function CustomStoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const categoryLabel = CATEGORY_LABELS[category] ?? 'Custom';
  const categoryTopics = CATEGORY_TOPICS[category] ?? [];
  const allTopics = [...new Set([...categoryTopics, ...SUGGESTED_TOPICS])];

  const [topics, setTopics] = useState<string[]>([]);
  const [values, setValues] = useState<string[]>([]);
  const [length, setLength] = useState<StoryLength>('medium');
  const [setting, setSetting] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);

  const generateStory = useGenerateStory();
  const { dailyStoriesUsed, dailyStoriesLimit, isPremium, refreshStatus } = useSubscription();
  const limitReached = dailyStoriesUsed >= dailyStoriesLimit;

  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const toggle = (
    list: string[],
    setList: (v: string[]) => void,
    item: string
  ) => setList(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const canGenerate = topics.length > 0 && values.length > 0 && !generateStory.isPending && !limitReached;

  const handleGenerate = async () => {
    if (limitReached) { setShowPaywall(true); return; }
    if (!canGenerate) return;

    const request: StoryRequest = {
      topics,
      values,
      length,
      setting: setting.trim() || undefined,
    };

    try {
      const result = await generateStory.mutateAsync(request);
      await refreshStatus();
      router.replace(`/(app)/stories/${result.session_id}`);
    } catch (error: any) {
      if (error.message?.includes('Rate limit') || error.message?.includes('Daily story limit')) {
        setShowPaywall(true);
      } else {
        console.error('Failed to generate story:', error);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Category context banner */}
        <View style={styles.banner}>
          <Text style={styles.bannerLabel}>{categoryLabel.toUpperCase()}</Text>
          <Text style={styles.bannerTitle}>Create a Custom Story</Text>
          <Text style={styles.bannerSub}>
            Pick a topic and values — we'll craft a unique story for you.
          </Text>
        </View>

        <ChipSelector
          label="Topic"
          items={allTopics}
          selected={topics}
          onToggle={(t) => toggle(topics, setTopics, t)}
        />

        <ChipSelector
          label="Values to teach"
          items={SUGGESTED_VALUES}
          selected={values}
          onToggle={(v) => toggle(values, setValues, v)}
        />

        <LengthSelector value={length} onChange={setLength} />

        <View style={styles.section}>
          <Text style={styles.label}>Setting (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., underwater kingdom, ancient India"
            placeholderTextColor={colors.textTertiary}
            value={setting}
            onChangeText={setSetting}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {!isPremium && (
          <Text style={styles.limitText}>
            {dailyStoriesUsed} / {dailyStoriesLimit} stories used today
            {limitReached && ' — Upgrade for unlimited'}
          </Text>
        )}
        <TouchableOpacity
          style={[
            styles.generateBtn,
            !canGenerate && styles.generateBtnDisabled,
            limitReached && styles.generateBtnLimited,
          ]}
          onPress={handleGenerate}
          disabled={generateStory.isPending}
        >
          {generateStory.isPending ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.generateBtnText}>Crafting your story...</Text>
            </View>
          ) : limitReached ? (
            <Text style={styles.generateBtnText}>Upgrade to Premium</Text>
          ) : (
            <Text style={styles.generateBtnText}>Generate Story</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={showPaywall} animationType="slide">
        <Paywall onClose={() => setShowPaywall(false)} />
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      padding: 20,
      paddingBottom: 120,
    },

    // Category banner
    banner: {
      marginBottom: 28,
    },
    bannerLabel: {
      color: c.accent,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.5,
      marginBottom: 6,
    },
    bannerTitle: {
      color: c.text,
      fontSize: 22,
      fontWeight: '800',
      marginBottom: 6,
    },
    bannerSub: {
      color: c.textTertiary,
      fontSize: 14,
      lineHeight: 20,
    },

    // Sections
    section: {
      marginBottom: 28,
    },
    label: {
      color: c.textSecondary,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 12,
      letterSpacing: 0.3,
    },

    // Chips
    chipContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      backgroundColor: c.surface,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: c.surfaceBorder,
    },
    chipSelected: {
      backgroundColor: 'rgba(249,115,22,0.12)',
      borderColor: c.accent,
    },
    chipText: {
      fontSize: 13,
      color: c.textTertiary,
    },
    chipTextSelected: {
      color: c.accent,
      fontWeight: '600',
    },

    // Length
    lengthRow: {
      flexDirection: 'row',
      gap: 10,
    },
    lengthOption: {
      flex: 1,
      backgroundColor: c.surface,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: c.surfaceBorder,
    },
    lengthOptionSelected: {
      backgroundColor: 'rgba(249,115,22,0.12)',
      borderColor: c.accent,
    },
    lengthLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textTertiary,
    },
    lengthLabelSelected: {
      color: c.accent,
    },
    lengthDesc: {
      fontSize: 11,
      color: c.textTertiary,
      marginTop: 3,
    },
    lengthDescSelected: {
      color: '#fb923c',
    },

    // Setting input
    input: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      fontSize: 14,
      color: c.text,
      borderWidth: 1.5,
      borderColor: c.surfaceBorder,
    },

    // Footer
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 20,
      backgroundColor: c.background,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    limitText: {
      fontSize: 12,
      color: c.textTertiary,
      textAlign: 'center',
      marginBottom: 10,
    },
    generateBtn: {
      backgroundColor: c.accent,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
    },
    generateBtnDisabled: {
      backgroundColor: '#7c2d12',
      opacity: 0.6,
    },
    generateBtnLimited: {
      backgroundColor: '#d97706',
    },
    generateBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
  });
}
