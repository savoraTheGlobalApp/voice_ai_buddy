import { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { useAuth } from '../../../src/contexts/AuthContext';
import { apiClient } from '../../../src/api/client';
import type { ThemeColors } from '../../../src/theme/colors';

interface WeeklySummary {
  week: string;
  balu: {
    sessions_count: number;
    classic_sessions: number;
    fun_sessions: number;
  };
  knowledge: {
    words_learned: string[];
    concepts_asked: string[];
    interests_shown: string[];
    session_highlights: string[];
  };
  stories: {
    completed_this_week: { story_id: string; completed_at: string; language: string }[];
    total_completed: number;
    hindi_count: number;
    english_count: number;
  };
}

export default function ParentCornerScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentUser } = useAuth();

  const { data, isLoading, isError, refetch, isFetching } = useQuery<WeeklySummary>({
    queryKey: ['parent-weekly-summary', currentUser?.uid],
    queryFn: () => apiClient<WeeklySummary>('/api/parent/weekly-summary'),
    enabled: !!currentUser,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading insights...</Text>
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>Could not load summary. Try again later.</Text>
        </View>
      ) : !data ? null : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent} />}
        >

          {/* ── Balu Conversations ────────────────────────────────── */}
          <SectionHeader icon="mic" label="Balu Conversations" colors={colors} />
          <View style={styles.card}>
            <StatRow label="Sessions this week" value={`${data.balu.sessions_count}`} colors={colors} />
            <StatRow label="📖 Stories mode" value={`${data.balu.classic_sessions}`} colors={colors} />
            <StatRow label="🎉 Fun mode" value={`${data.balu.fun_sessions}`} colors={colors} />
          </View>

          {/* ── Language & Stories ─────────────────────────────────── */}
          <SectionHeader icon="language" label="Language & Stories" colors={colors} />
          <View style={styles.card}>
            <StatRow label="Stories completed" value={`${data.stories.total_completed}`} colors={colors} />
            <StatRow label="Read in English" value={`${data.stories.english_count}`} colors={colors} />
            <StatRow label="Read in Hindi" value={`${data.stories.hindi_count}`} colors={colors} />
            {data.stories.completed_this_week.length > 0 && (
              <View style={styles.chipsSection}>
                <Text style={styles.chipsLabel}>Completed this week</Text>
                <View style={styles.chips}>
                  {data.stories.completed_this_week.map((s) => (
                    <Chip key={s.story_id} label={`${s.story_id} (${s.language.toUpperCase()})`} colors={colors} />
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* ── Knowledge & Curiosity ──────────────────────────────── */}
          <SectionHeader icon="bulb" label="Knowledge & Curiosity" colors={colors} />

          {data.knowledge.words_learned.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardSubtitle}>Words learned</Text>
              <View style={styles.chips}>
                {data.knowledge.words_learned.map((w) => (
                  <Chip key={w} label={w} colors={colors} accent />
                ))}
              </View>
            </View>
          )}

          {data.knowledge.concepts_asked.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardSubtitle}>Questions asked</Text>
              {data.knowledge.concepts_asked.map((q) => (
                <View key={q} style={styles.questionRow}>
                  <Text style={styles.questionBullet}>💬</Text>
                  <Text style={styles.questionText}>{q}</Text>
                </View>
              ))}
            </View>
          )}

          {data.knowledge.interests_shown.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardSubtitle}>Interests shown</Text>
              <View style={styles.chips}>
                {data.knowledge.interests_shown.map((i) => (
                  <Chip key={i} label={i} colors={colors} />
                ))}
              </View>
            </View>
          )}

          {data.knowledge.session_highlights.length > 0 && (
            <View style={[styles.card, styles.highlightsCard]}>
              <Text style={styles.cardSubtitle}>Session highlights</Text>
              {data.knowledge.session_highlights.map((h, idx) => (
                <Text key={idx} style={styles.highlightText}>✨ {h}</Text>
              ))}
            </View>
          )}

          {data.balu.sessions_count === 0 && data.stories.total_completed === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🐻</Text>
              <Text style={styles.emptyTitle}>No activity this week yet</Text>
              <Text style={styles.emptySubtitle}>Start a Balu conversation or read a story to see insights here!</Text>
            </View>
          )}

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SectionHeader({ icon, label, colors }: { icon: any; label: string; colors: ThemeColors }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 8, paddingHorizontal: 16 }}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </Text>
    </View>
  );
}

function StatRow({ label, value, colors }: { label: string; value: string; colors: ThemeColors }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surfaceBorder }}>
      <Text style={{ fontSize: 15, color: colors.text }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.accent }}>{value}</Text>
    </View>
  );
}

function Chip({ label, colors, accent }: { label: string; colors: ThemeColors; accent?: boolean }) {
  return (
    <View style={{
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 20,
      backgroundColor: accent ? colors.accent + '20' : colors.surface,
      borderWidth: 1,
      borderColor: accent ? colors.accent + '40' : colors.surfaceBorder,
      marginRight: 6,
      marginBottom: 6,
    }}>
      <Text style={{ fontSize: 13, color: accent ? colors.accent : colors.text, fontWeight: accent ? '600' : '400' }}>
        {label}
      </Text>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: c.background },
    center:       { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
    loadingText:  { color: c.textSecondary, fontSize: 14 },
    content:      { paddingBottom: 40 },
    card: {
      marginHorizontal: 16,
      marginBottom: 4,
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: c.surfaceBorder,
    },
    cardSubtitle: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 10 },
    chipsSection: { marginTop: 12 },
    chipsLabel:   { fontSize: 13, color: c.textSecondary, marginBottom: 6 },
    chips:        { flexDirection: 'row', flexWrap: 'wrap' },
    questionRow:  { flexDirection: 'row', gap: 8, marginBottom: 8 },
    questionBullet: { fontSize: 15 },
    questionText: { flex: 1, fontSize: 14, color: c.text, lineHeight: 20 },
    highlightsCard: { backgroundColor: c.accent + '0D' },
    highlightText: { fontSize: 14, color: c.text, lineHeight: 22, marginBottom: 6 },
    emptyCard: {
      margin: 16,
      padding: 32,
      borderRadius: 16,
      backgroundColor: c.surface,
      alignItems: 'center',
      gap: 8,
    },
    emptyEmoji:    { fontSize: 48 },
    emptyTitle:    { fontSize: 17, fontWeight: '700', color: c.text },
    emptySubtitle: { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20 },
    emptyText:     { fontSize: 14, color: c.textSecondary, textAlign: 'center' },
  });
}
