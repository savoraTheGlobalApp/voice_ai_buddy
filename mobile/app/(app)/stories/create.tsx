import { useState } from 'react';
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
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGenerateStory } from '../../../src/hooks/useStories';
import { useSubscription } from '../../../src/contexts/SubscriptionContext';
import Paywall from '../../../src/components/Paywall';
import { SUGGESTED_TOPICS, SUGGESTED_VALUES, StoryRequest } from '../../../src/types/stories';

type StoryLength = 'short' | 'medium' | 'long';

function ChipSelector({
  label,
  suggestions,
  selected,
  onToggle,
}: {
  label: string;
  suggestions: string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <View style={styles.chipSection}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipContainer}>
        {suggestions.map((item) => {
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
  onChange: (length: StoryLength) => void;
}) {
  const options: { value: StoryLength; label: string; segments: string }[] = [
    { value: 'short', label: 'Short', segments: '3 parts' },
    { value: 'medium', label: 'Medium', segments: '5 parts' },
    { value: 'long', label: 'Long', segments: '7 parts' },
  ];

  return (
    <View style={styles.chipSection}>
      <Text style={styles.label}>Story Length</Text>
      <View style={styles.lengthContainer}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[styles.lengthOption, value === option.value && styles.lengthOptionSelected]}
            onPress={() => onChange(option.value)}
          >
            <Text
              style={[styles.lengthLabel, value === option.value && styles.lengthLabelSelected]}
            >
              {option.label}
            </Text>
            <Text
              style={[styles.lengthSub, value === option.value && styles.lengthSubSelected]}
            >
              {option.segments}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function CreateStoryScreen() {
  const [topics, setTopics] = useState<string[]>([]);
  const [values, setValues] = useState<string[]>([]);
  const [length, setLength] = useState<StoryLength>('medium');
  const [setting, setSetting] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);

  const generateStory = useGenerateStory();
  const { dailyStoriesUsed, dailyStoriesLimit, isPremium, refreshStatus } = useSubscription();

  const limitReached = dailyStoriesUsed >= dailyStoriesLimit;

  const toggleTopic = (topic: string) => {
    setTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const toggleValue = (value: string) => {
    setValues((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleGenerate = async () => {
    if (limitReached) {
      setShowPaywall(true);
      return;
    }
    if (topics.length === 0) {
      return;
    }
    if (values.length === 0) {
      return;
    }

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

  const canGenerate = topics.length > 0 && values.length > 0 && !generateStory.isPending && !limitReached;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <ChipSelector
          label="What topics interest your child?"
          suggestions={SUGGESTED_TOPICS}
          selected={topics}
          onToggle={toggleTopic}
        />

        <ChipSelector
          label="What values should the story teach?"
          suggestions={SUGGESTED_VALUES}
          selected={values}
          onToggle={toggleValue}
        />

        <LengthSelector value={length} onChange={setLength} />

        <View style={styles.chipSection}>
          <Text style={styles.label}>Setting (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., underwater kingdom, space station"
            placeholderTextColor="#9ca3af"
            value={setting}
            onChangeText={setSetting}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {!isPremium && (
          <Text style={styles.limitText}>
            {dailyStoriesUsed} / {dailyStoriesLimit} stories used today
            {limitReached && ' — Upgrade for unlimited stories'}
          </Text>
        )}
        <TouchableOpacity
          style={[
            styles.generateButton,
            !canGenerate && styles.generateButtonDisabled,
            limitReached && styles.generateButtonLimited,
          ]}
          onPress={handleGenerate}
          disabled={generateStory.isPending}
        >
          {generateStory.isPending ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.generateButtonText}>Creating your story...</Text>
            </View>
          ) : limitReached ? (
            <Text style={styles.generateButtonText}>Upgrade to Premium</Text>
          ) : (
            <Text style={styles.generateButtonText}>Generate Story</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={showPaywall} animationType="slide">
        <Paywall onClose={() => setShowPaywall(false)} />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  chipSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  chipText: {
    fontSize: 14,
    color: '#4b5563',
  },
  chipTextSelected: {
    color: '#3b82f6',
    fontWeight: '500',
  },
  lengthContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  lengthOption: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 16,
    borderRadius: 12,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  lengthOptionSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  lengthLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4b5563',
  },
  lengthLabelSelected: {
    color: '#3b82f6',
  },
  lengthSub: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  lengthSubSelected: {
    color: '#60a5fa',
  },
  input: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1f2937',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  generateButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  generateButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  generateButtonLimited: {
    backgroundColor: '#f59e0b',
  },
  limitText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 8,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
