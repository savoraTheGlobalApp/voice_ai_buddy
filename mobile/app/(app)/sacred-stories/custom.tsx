import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGenerateCustomStory } from '../../../src/hooks/useCustomStory';
import { useAuth } from '../../../src/contexts/AuthContext';
import Paywall from '../../../src/components/Paywall';
import { useTheme } from '../../../src/contexts/ThemeContext';
import type { ThemeColors } from '../../../src/theme/colors';
import type { CustomStoryRequest } from '../../../src/api/customStories';

type StoryLength = 'short' | 'medium' | 'long';

const CATEGORY_LABELS: Record<string, string> = {
  mahabharata:  'Mahabharata',
  ramayana:     'Ramayana',
  habits:       'Daily Habits',
  emotions:     'Emotions',
  moral_values: 'Moral Values',
};

// ── Shared primitive components ──────────────────────────────────────────────

function ChipGroup({
  label,
  items,
  selected,
  multi,
  onToggle,
}: {
  label: string;
  items: string[];
  selected: string[];
  multi?: boolean;
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

function LengthSelector({ value, onChange }: { value: StoryLength; onChange: (l: StoryLength) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const options: { value: StoryLength; label: string; desc: string }[] = [
    { value: 'short',  label: 'Short',  desc: '10 blocks' },
    { value: 'medium', label: 'Medium', desc: '16 blocks' },
    { value: 'long',   label: 'Long',   desc: '20 blocks' },
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

// ── Category-specific forms ───────────────────────────────────────────────────

function HabitsForm({
  onReady,
}: {
  onReady: (fields: Partial<CustomStoryRequest>, valid: boolean) => void;
}) {
  const HABITS = ['brushing teeth', 'eating vegetables', 'bedtime routine', 'morning routine', 'screen time', 'exercise', 'reading', 'tidying room'];
  const CHALLENGES = ['forgets often', "doesn't enjoy it", 'gets distracted', 'prefers other things', 'wants to rush'];
  const HELPERS = ['magical creature', 'best friend', 'parent', 'superhero', 'animal companion'];

  const [habit, setHabit] = useState('');
  const [challenge, setChallenge] = useState('');
  const [helper, setHelper] = useState('');

  const update = (h: string, c: string, hp: string) => {
    onReady({ habit: h, challenge: c, helper: hp }, !!h && !!c && !!hp);
  };

  const pick = (val: string, cur: string, set: (v: string) => void, key: 'habit' | 'challenge' | 'helper') => {
    const next = cur === val ? '' : val;
    set(next);
    const fields = { habit, challenge, helper, [key]: next };
    update(fields.habit, fields.challenge, fields.helper);
  };

  return (
    <>
      <ChipGroup label="Habit to learn" items={HABITS} selected={habit ? [habit] : []} multi={false}
        onToggle={(v) => pick(v, habit, setHabit, 'habit')} />
      <ChipGroup label="The challenge" items={CHALLENGES} selected={challenge ? [challenge] : []} multi={false}
        onToggle={(v) => pick(v, challenge, setChallenge, 'challenge')} />
      <ChipGroup label="Who helps" items={HELPERS} selected={helper ? [helper] : []} multi={false}
        onToggle={(v) => pick(v, helper, setHelper, 'helper')} />
    </>
  );
}

function EmotionsForm({ onReady }: { onReady: (fields: Partial<CustomStoryRequest>, valid: boolean) => void }) {
  const EMOTIONS = ['anger', 'fear', 'jealousy', 'sadness', 'worry', 'loneliness', 'excitement', 'embarrassment'];
  const TRIGGERS = ["didn't get something wanted", 'lost a game', 'first time at something new', 'a friend was mean', 'felt left out'];
  const RESOLUTIONS = ['figured it out alone', "with parent's help", 'with a friend', 'with a magical guide'];

  const [emotions, setEmotions] = useState<string[]>([]);
  const [trigger, setTrigger] = useState('');
  const [resolution, setResolution] = useState('');

  const update = (em: string[], tr: string, re: string) => {
    onReady({ emotions: em, trigger: tr, resolution: re }, em.length > 0 && !!tr && !!re);
  };

  return (
    <>
      <ChipGroup label="Emotion(s) to explore" items={EMOTIONS} selected={emotions} multi
        onToggle={(v) => {
          const next = emotions.includes(v) ? emotions.filter((e) => e !== v) : [...emotions, v];
          setEmotions(next);
          update(next, trigger, resolution);
        }} />
      <ChipGroup label="What triggers it" items={TRIGGERS} selected={trigger ? [trigger] : []} multi={false}
        onToggle={(v) => {
          const next = trigger === v ? '' : v;
          setTrigger(next);
          update(emotions, next, resolution);
        }} />
      <ChipGroup label="How it resolves" items={RESOLUTIONS} selected={resolution ? [resolution] : []} multi={false}
        onToggle={(v) => {
          const next = resolution === v ? '' : v;
          setResolution(next);
          update(emotions, trigger, next);
        }} />
    </>
  );
}

function MoralValuesForm({ onReady }: { onReady: (fields: Partial<CustomStoryRequest>, valid: boolean) => void }) {
  const VALUES = ['kindness', 'honesty', 'sharing', 'courage', 'patience', 'empathy', 'respect', 'fairness', 'gratitude'];
  const DILEMMAS = ['found something not theirs', 'asked to tell a lie', 'witnessed someone being bullied', 'had to take turns', 'made a mistake'];
  const SETTINGS = ['school', 'home', 'playground', 'market', 'forest', 'festival'];

  const [value, setValue] = useState('');
  const [dilemma, setDilemma] = useState('');
  const [setting, setSetting] = useState('');

  const update = (v: string, d: string, s: string) => {
    onReady({ value: v, dilemma: d, setting: s }, !!v && !!d && !!s);
  };

  const pick = (val: string, cur: string, set: (v: string) => void, key: 'value' | 'dilemma' | 'setting') => {
    const next = cur === val ? '' : val;
    set(next);
    const fields = { value, dilemma, setting, [key]: next };
    update(fields.value, fields.dilemma, fields.setting);
  };

  return (
    <>
      <ChipGroup label="Value to teach" items={VALUES} selected={value ? [value] : []} multi={false}
        onToggle={(v) => pick(v, value, setValue, 'value')} />
      <ChipGroup label="The dilemma" items={DILEMMAS} selected={dilemma ? [dilemma] : []} multi={false}
        onToggle={(v) => pick(v, dilemma, setDilemma, 'dilemma')} />
      <ChipGroup label="Setting" items={SETTINGS} selected={setting ? [setting] : []} multi={false}
        onToggle={(v) => pick(v, setting, setSetting, 'setting')} />
    </>
  );
}

function MahabharataForm({ onReady }: { onReady: (fields: Partial<CustomStoryRequest>, valid: boolean) => void }) {
  const CHARACTERS = ['Arjuna', 'Krishna', 'Yudhishthira', 'Bhima', 'Draupadi', 'Karna', 'Abhimanyu'];
  const THEMES = ['Bhagavad Gita teachings', 'Childhood of Pandavas', 'The dice game', 'Kurukshetra battle', "Karna's loyalty", "Draupadi's courage"];

  const [characters, setCharacters] = useState<string[]>([]);
  const [theme, setTheme] = useState('');
  const [langStyle, setLangStyle] = useState<'simple' | 'classical'>('simple');

  const update = (ch: string[], th: string, ls: 'simple' | 'classical') => {
    onReady({ characters: ch, theme: th, language_style: ls }, ch.length > 0 && !!th);
  };

  return (
    <>
      <ChipGroup label="Characters" items={CHARACTERS} selected={characters} multi
        onToggle={(v) => {
          const next = characters.includes(v) ? characters.filter((c) => c !== v) : [...characters, v];
          setCharacters(next);
          update(next, theme, langStyle);
        }} />
      <ChipGroup label="Episode / Theme" items={THEMES} selected={theme ? [theme] : []} multi={false}
        onToggle={(v) => {
          const next = theme === v ? '' : v;
          setTheme(next);
          update(characters, next, langStyle);
        }} />
      <LanguageStyleToggle value={langStyle} onChange={(v) => { setLangStyle(v); update(characters, theme, v); }} />
    </>
  );
}

function RamayanaForm({ onReady }: { onReady: (fields: Partial<CustomStoryRequest>, valid: boolean) => void }) {
  const CHARACTERS = ['Rama', 'Sita', 'Hanuman', 'Lakshmana', 'Ravana', 'Jatayu', 'Shabari'];
  const THEMES = ["Rama's childhood", 'Exile in the forest', 'Search for Sita', "Hanuman's great leap", 'Battle of Lanka', 'Return to Ayodhya'];

  const [characters, setCharacters] = useState<string[]>([]);
  const [theme, setTheme] = useState('');
  const [langStyle, setLangStyle] = useState<'simple' | 'classical'>('simple');

  const update = (ch: string[], th: string, ls: 'simple' | 'classical') => {
    onReady({ characters: ch, theme: th, language_style: ls }, ch.length > 0 && !!th);
  };

  return (
    <>
      <ChipGroup label="Characters" items={CHARACTERS} selected={characters} multi
        onToggle={(v) => {
          const next = characters.includes(v) ? characters.filter((c) => c !== v) : [...characters, v];
          setCharacters(next);
          update(next, theme, langStyle);
        }} />
      <ChipGroup label="Episode / Theme" items={THEMES} selected={theme ? [theme] : []} multi={false}
        onToggle={(v) => {
          const next = theme === v ? '' : v;
          setTheme(next);
          update(characters, next, langStyle);
        }} />
      <LanguageStyleToggle value={langStyle} onChange={(v) => { setLangStyle(v); update(characters, theme, v); }} />
    </>
  );
}

function LanguageStyleToggle({
  value,
  onChange,
}: {
  value: 'simple' | 'classical';
  onChange: (v: 'simple' | 'classical') => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Text style={styles.label}>Language style</Text>
      <View style={styles.lengthRow}>
        {(['simple', 'classical'] as const).map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.lengthOption, value === opt && styles.lengthOptionSelected]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.lengthLabel, value === opt && styles.lengthLabelSelected]}>
              {opt === 'simple' ? 'Simple' : 'Classical'}
            </Text>
            <Text style={[styles.lengthDesc, value === opt && styles.lengthDescSelected]}>
              {opt === 'simple' ? 'Ages 5–8' : 'Ages 8+'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CustomStoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const { currentUser } = useAuth();
  const categoryLabel = CATEGORY_LABELS[category] ?? 'Custom';

  const [length, setLength] = useState<StoryLength>('medium');
  const [categoryFields, setCategoryFields] = useState<Partial<CustomStoryRequest>>({});
  const [formValid, setFormValid] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [libraryFullDialog, setLibraryFullDialog] = useState(false);

  const generateStory = useGenerateCustomStory();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleFormReady = (fields: Partial<CustomStoryRequest>, valid: boolean) => {
    setCategoryFields(fields);
    setFormValid(valid);
  };

  const canGenerate = formValid && !generateStory.isPending && !!currentUser;

  const handleGenerate = async () => {
    if (!currentUser || !canGenerate) return;

    const request: CustomStoryRequest = {
      category,
      length,
      ...categoryFields,
    };

    try {
      const result = await generateStory.mutateAsync({ uid: currentUser.uid, request });
      router.replace(`/(app)/sacred-stories/block-viewer?contentId=${result.contentId}&source=custom`);
    } catch (error: any) {
      const msg: string = error?.message ?? '';
      if (msg.includes('Story library full')) {
        setLibraryFullDialog(true);
      } else if (msg.includes('Daily custom story limit') || msg.includes('Rate limit')) {
        setShowPaywall(true);
      } else {
        Alert.alert('Error', msg || 'Failed to generate story. Please try again.');
      }
    }
  };

  const renderCategoryForm = () => {
    switch (category) {
      case 'habits':       return <HabitsForm onReady={handleFormReady} />;
      case 'emotions':     return <EmotionsForm onReady={handleFormReady} />;
      case 'moral_values': return <MoralValuesForm onReady={handleFormReady} />;
      case 'mahabharata':  return <MahabharataForm onReady={handleFormReady} />;
      case 'ramayana':     return <RamayanaForm onReady={handleFormReady} />;
      default:             return null;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.banner}>
          <Text style={styles.bannerLabel}>{categoryLabel.toUpperCase()}</Text>
          <Text style={styles.bannerTitle}>Create a Custom Story</Text>
          <Text style={styles.bannerSub}>
            Choose options below — we'll craft a unique bilingual story.
          </Text>
        </View>

        {renderCategoryForm()}

        <LengthSelector value={length} onChange={setLength} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.generateBtn, !canGenerate && styles.generateBtnDisabled]}
          onPress={handleGenerate}
          disabled={!canGenerate}
        >
          {generateStory.isPending ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.generateBtnText}>Writing your story...</Text>
            </View>
          ) : (
            <Text style={styles.generateBtnText}>Generate Story</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={showPaywall} animationType="slide">
        <Paywall onClose={() => setShowPaywall(false)} />
      </Modal>

      <Modal visible={libraryFullDialog} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Story Library Full</Text>
            <Text style={styles.dialogBody}>
              You've reached your 10 story limit. Delete an old story to make room for a new one.
            </Text>
            <TouchableOpacity style={styles.dialogBtn} onPress={() => setLibraryFullDialog(false)}>
              <Text style={styles.dialogBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20, paddingBottom: 120 },

    banner: { marginBottom: 28 },
    bannerLabel: { color: c.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
    bannerTitle: { color: c.text, fontSize: 22, fontWeight: '800', marginBottom: 6 },
    bannerSub: { color: c.textTertiary, fontSize: 14, lineHeight: 20 },

    section: { marginBottom: 28 },
    label: { color: c.textSecondary, fontSize: 14, fontWeight: '600', marginBottom: 12, letterSpacing: 0.3 },

    chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      backgroundColor: c.surface,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: c.surfaceBorder,
    },
    chipSelected: { backgroundColor: 'rgba(249,115,22,0.12)', borderColor: c.accent },
    chipText: { fontSize: 13, color: c.textTertiary },
    chipTextSelected: { color: c.accent, fontWeight: '600' },

    lengthRow: { flexDirection: 'row', gap: 10 },
    lengthOption: {
      flex: 1,
      backgroundColor: c.surface,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: c.surfaceBorder,
    },
    lengthOptionSelected: { backgroundColor: 'rgba(249,115,22,0.12)', borderColor: c.accent },
    lengthLabel: { fontSize: 15, fontWeight: '600', color: c.textTertiary },
    lengthLabelSelected: { color: c.accent },
    lengthDesc: { fontSize: 11, color: c.textTertiary, marginTop: 3 },
    lengthDescSelected: { color: '#fb923c' },

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
    generateBtn: {
      backgroundColor: c.accent,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
    },
    generateBtnDisabled: { opacity: 0.4 },
    generateBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    loadingRow: { flexDirection: 'row', alignItems: 'center' },

    // Library full dialog
    dialogOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    dialog: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 24,
      width: '100%',
      maxWidth: 340,
    },
    dialogTitle: { color: c.text, fontSize: 18, fontWeight: '700', marginBottom: 10 },
    dialogBody: { color: c.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 20 },
    dialogBtn: {
      backgroundColor: c.accent,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    dialogBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  });
}
