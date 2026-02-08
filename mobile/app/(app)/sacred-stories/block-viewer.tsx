import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/contexts/AuthContext';
import { ContentViewer } from '../../../src/components/blocks/ContentViewer';
import { useBlockContent } from '../../../src/hooks/useStaticStories';
import { createSampleBlockContent } from '../../../src/utils/storyToBlocks';

type Language = 'en' | 'hi';

export default function BlockViewerScreen() {
  const { contentId, experimentId, variantOverride } = useLocalSearchParams<{
    contentId?: string;
    experimentId?: string;
    variantOverride?: string;
  }>();
  const { currentUser } = useAuth();

  // Default to "maha-001" if no contentId provided
  const storyId = contentId || 'maha-001';

  const [language, setLanguage] = useState<Language>('en');
  const [quizResults, setQuizResults] = useState<Record<string, boolean>>({});
  const [useFallback, setUseFallback] = useState(false);

  // Try to fetch from API
  // Backend decides which experiments to apply based on story configuration
  const {
    data: content,
    isLoading,
    error,
    refetch,
  } = useBlockContent({
    storyId,
    userId: currentUser?.uid,
    experimentId: experimentId,  // Optional - only for testing/override
    variantOverride,
  });

  // Fall back to sample content if API fails
  const displayContent = useFallback ? createSampleBlockContent() : content;

  useEffect(() => {
    if (error && !useFallback) {
      console.log('API error, using fallback content:', error);
      setUseFallback(true);
    }
  }, [error, useFallback]);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => (prev === 'en' ? 'hi' : 'en'));
  }, []);

  const handleComplete = useCallback(() => {
    // Track completion
    console.log('Content completed!', {
      contentId: displayContent?.contentId,
      quizResults,
      experimentInfo: displayContent?.experiment,
    });

    // Navigate back
    router.back();
  }, [displayContent, quizResults]);

  const handleQuizAnswer = useCallback((blockId: string, isCorrect: boolean) => {
    setQuizResults((prev) => ({
      ...prev,
      [blockId]: isCorrect,
    }));

    // Track quiz answer for analytics
    console.log('Quiz answer:', { blockId, isCorrect });
  }, []);

  if (isLoading && !useFallback) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#f97316" />
          <Text style={styles.loadingText}>Loading content...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!displayContent) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Content not found</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setUseFallback(false);
              refetch();
            }}
          >
            <Text style={styles.retryText}>Retry API</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.retryButton, styles.fallbackButton]}
            onPress={() => setUseFallback(true)}
          >
            <Text style={styles.retryText}>Use Sample Content</Text>
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

  return (
    <>
      <Stack.Screen
        options={{
          title: displayContent.title[language],
          headerRight: () => (
            <TouchableOpacity onPress={toggleLanguage} style={styles.languageToggle}>
              <Text style={styles.languageToggleText}>
                {language === 'en' ? 'हिं' : 'EN'}
              </Text>
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Experiment indicator (dev only) */}
        {__DEV__ && (
          <View style={styles.experimentBadge}>
            <Text style={styles.experimentText}>
              {useFallback
                ? 'Using sample content (offline)'
                : displayContent.experiment
                ? `Exp: ${displayContent.experiment.experimentId} | Var: ${displayContent.experiment.variantId}`
                : 'No experiment assigned'}
            </Text>
          </View>
        )}

        <ContentViewer
          content={displayContent}
          language={language}
          onLanguageToggle={toggleLanguage}
          onComplete={handleComplete}
          onQuizAnswer={handleQuizAnswer}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
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
  fallbackButton: {
    backgroundColor: '#8b5cf6',
  },
  backButton: {
    backgroundColor: '#6b7280',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  languageToggle: {
    marginRight: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  languageToggleText: {
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
