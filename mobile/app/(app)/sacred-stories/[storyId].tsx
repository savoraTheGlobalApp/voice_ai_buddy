import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStaticStory, useStoryProgress, useUpdateProgress } from '../../../src/hooks/useStaticStories';
import { useAuth } from '../../../src/contexts/AuthContext';

type Language = 'en' | 'hi';

// Character emoji mapping
const CHARACTER_AVATARS: Record<string, string> = {
  krishna: '🦚',
  arjuna: '🏹',
};

export default function StaticStoryViewerScreen() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const { currentUser } = useAuth();
  const { data: story, isLoading: storyLoading, error: storyError } = useStaticStory(storyId);
  const { data: progress, isLoading: progressLoading } = useStoryProgress(currentUser?.uid, storyId);
  const updateProgress = useUpdateProgress();

  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [language, setLanguage] = useState<Language>('en');
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Initialize segment from saved progress
  useEffect(() => {
    if (progress && progress.current_segment !== undefined) {
      setCurrentSegmentIndex(progress.current_segment);
    }
  }, [progress]);

  // Fade animation on segment change
  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [currentSegmentIndex]);

  // Save progress when leaving the story (on unmount)
  useEffect(() => {
    return () => {
      // Save progress when component unmounts (user navigates away)
      if (currentUser?.uid && story && currentSegmentIndex > 0) {
        const status = currentSegmentIndex === story.segments.length - 1 ? 'completed' : 'in_progress';
        updateProgress.mutate({
          userId: currentUser.uid,
          storyId,
          currentSegment: currentSegmentIndex,
          status,
        });
      }
    };
  }, [currentUser?.uid, storyId, currentSegmentIndex, story]);

  // Mark as in_progress when first loaded
  useEffect(() => {
    if (currentUser?.uid && story && (!progress || progress.status === 'not_started')) {
      updateProgress.mutate({
        userId: currentUser.uid,
        storyId,
        currentSegment: 0,
        status: 'in_progress',
      });
    }
  }, [story?.story_id, currentUser?.uid]);

  if (storyLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#f97316" />
          <Text style={styles.loadingText}>Loading sacred story...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (storyError || !story) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Failed to load story</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentSegment = story.segments[currentSegmentIndex];
  const totalSegments = story.segments.length;
  const isFirstSegment = currentSegmentIndex === 0;
  const isLastSegment = currentSegmentIndex === totalSegments - 1;

  // Calculate time remaining (assuming ~1 min per segment)
  const segmentsRemaining = totalSegments - currentSegmentIndex;
  const timeRemaining = segmentsRemaining;

  // Get character avatars for this story
  const characterAvatars = story.characters.map(charId => CHARACTER_AVATARS[charId] || '👤');

  const goToPrevious = () => {
    if (!isFirstSegment) {
      setCurrentSegmentIndex((prev) => prev - 1);
    }
  };

  const goToNext = () => {
    if (!isLastSegment) {
      setCurrentSegmentIndex((prev) => prev + 1);
    }
  };

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === 'en' ? 'hi' : 'en'));
  };

  const handleFinish = () => {
    if (currentUser?.uid) {
      updateProgress.mutate(
        {
          userId: currentUser.uid,
          storyId,
          currentSegment: totalSegments - 1,
          status: 'completed',
        },
        {
          onSuccess: (data) => {
            // Show character unlock notification if any
            if (data?.unlocked_characters && data.unlocked_characters.length > 0) {
              Alert.alert(
                '🎉 New Characters Unlocked!',
                `You unlocked: ${data.unlocked_characters.join(', ')}! Check the Character Collection.`,
                [{ text: 'View Characters', onPress: () => router.push('/(app)/sacred-stories/characters') }]
              );
            }
            router.back();
          },
        }
      );
    } else {
      router.back();
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: story.title[language],
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
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Category Badge */}
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>
              {story.category.charAt(0).toUpperCase() + story.category.slice(1)}
            </Text>
          </View>

          {/* Progress indicator */}
          <View style={styles.progressContainer}>
            {story.segments.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.progressDot,
                  index === currentSegmentIndex && styles.progressDotActive,
                  index < currentSegmentIndex && styles.progressDotCompleted,
                ]}
              />
            ))}
          </View>

          <Text style={styles.progressText}>
            Part {currentSegmentIndex + 1} of {totalSegments}
          </Text>

          {/* Time Remaining & Characters */}
          <View style={styles.metaInfoRow}>
            <View style={styles.timeIndicator}>
              <Ionicons name="time-outline" size={16} color="#6b7280" />
              <Text style={styles.timeText}>
                {timeRemaining} min {language === 'en' ? 'remaining' : 'शेष'}
              </Text>
            </View>
            <View style={styles.charactersRow}>
              {characterAvatars.map((avatar, idx) => (
                <View key={idx} style={styles.characterAvatar}>
                  <Text style={styles.characterAvatarText}>{avatar}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Story content with animation */}
          <Animated.View style={[styles.contentCard, { opacity: fadeAnim }]}>
            <Text style={[styles.narrative, language === 'hi' && styles.narrativeHindi]}>
              {currentSegment.narrative[language]}
            </Text>
          </Animated.View>

          {/* Discussion question */}
          {currentSegment.discussionQuestion && (
            <View style={styles.discussionBox}>
              <View style={styles.discussionHeader}>
                <Ionicons name="chatbubble-ellipses" size={20} color="#92400e" />
                <Text style={styles.discussionTitle}>
                  {language === 'en' ? "Let's Talk!" : 'बात करते हैं!'}
                </Text>
              </View>
              <Text style={[styles.discussionQuestion, language === 'hi' && styles.discussionQuestionHindi]}>
                {currentSegment.discussionQuestion[language]}
              </Text>
            </View>
          )}

          {/* Values Chips */}
          <View style={styles.valuesSection}>
            <Text style={styles.valuesSectionTitle}>
              {language === 'en' ? 'Values in this story:' : 'इस कहानी में मूल्य:'}
            </Text>
            <View style={styles.valuesContainer}>
              {story.values.map((value) => (
                <View key={value} style={styles.valueChip}>
                  <Text style={styles.valueText}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Navigation buttons */}
        <View style={styles.navigationContainer}>
          <TouchableOpacity
            style={[styles.navButton, isFirstSegment && styles.navButtonDisabled]}
            onPress={goToPrevious}
            disabled={isFirstSegment}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={isFirstSegment ? '#d1d5db' : '#f97316'}
            />
            <Text style={[styles.navButtonText, isFirstSegment && styles.navButtonTextDisabled]}>
              {language === 'en' ? 'Previous' : 'पिछला'}
            </Text>
          </TouchableOpacity>

          {isLastSegment ? (
            <TouchableOpacity
              style={styles.finishButton}
              onPress={handleFinish}
            >
              <Text style={styles.finishButtonText}>
                {language === 'en' ? 'Finish' : 'समाप्त'}
              </Text>
              <Ionicons name="checkmark" size={24} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.nextButton} onPress={goToNext}>
              <Text style={styles.nextButtonText}>
                {language === 'en' ? 'Next' : 'अगला'}
              </Text>
              <Ionicons name="chevron-forward" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff7ed', // Saffron/orange tinted background
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  retryButton: {
    backgroundColor: '#f97316',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
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
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fb923c',
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f97316',
    textTransform: 'uppercase',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 4,
  },
  progressDotActive: {
    backgroundColor: '#f97316',
    width: 24,
  },
  progressDotCompleted: {
    backgroundColor: '#fb923c',
  },
  progressText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  metaInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  timeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 6,
  },
  timeText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  charactersRow: {
    flexDirection: 'row',
    gap: 8,
  },
  characterAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff7ed',
    borderWidth: 2,
    borderColor: '#fb923c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  characterAvatarText: {
    fontSize: 20,
  },
  contentCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderTopWidth: 3,
    borderTopColor: '#f97316',
    borderLeftWidth: 1,
    borderLeftColor: '#fb923c',
  },
  narrative: {
    fontSize: 18,
    lineHeight: 32,
    letterSpacing: 0.3,
    color: '#1f2937',
  },
  narrativeHindi: {
    fontSize: 20,
    lineHeight: 36,
    letterSpacing: 0.5,
  },
  discussionBox: {
    backgroundColor: '#fff7ed',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#fb923c',
  },
  discussionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  discussionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400e',
    marginLeft: 8,
  },
  discussionQuestion: {
    fontSize: 16,
    lineHeight: 24,
    color: '#78350f',
    fontStyle: 'italic',
  },
  discussionQuestionHindi: {
    fontSize: 18,
    lineHeight: 28,
  },
  valuesSection: {
    marginTop: 16,
  },
  valuesSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  valuesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  valueChip: {
    backgroundColor: '#fff7ed',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fb923c',
  },
  valueText: {
    fontSize: 12,
    color: '#f97316',
    fontWeight: '500',
  },
  navigationContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 16,
    color: '#f97316',
    marginLeft: 4,
  },
  navButtonTextDisabled: {
    color: '#d1d5db',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f97316',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginRight: 4,
  },
  finishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  finishButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginRight: 4,
  },
});
