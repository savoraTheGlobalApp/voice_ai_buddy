import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStory, useUpdateStoryStatus } from '../../../src/hooks/useStories';

export default function StoryViewerScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { data: story, isLoading, error } = useStory(sessionId);
  const updateStatus = useUpdateStoryStatus();

  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);

  // Mark as read when first loaded
  useEffect(() => {
    if (story && story.status === 'generated') {
      updateStatus.mutate({ sessionId, status: 'read' });
    }
  }, [story?.session_id]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading story...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !story) {
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

  const toggleFavorite = () => {
    const newStatus = story.status === 'favorite' ? 'read' : 'favorite';
    updateStatus.mutate({ sessionId, status: newStatus });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: story.title,
          headerRight: () => (
            <TouchableOpacity onPress={toggleFavorite} style={{ marginRight: 8 }}>
              <Ionicons
                name={story.status === 'favorite' ? 'star' : 'star-outline'}
                size={24}
                color={story.status === 'favorite' ? '#fbbf24' : '#fff'}
              />
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
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

          {/* Story content */}
          <View style={styles.contentCard}>
            <Text style={styles.narrative}>{currentSegment.narrative}</Text>
          </View>

          {/* Discussion question */}
          {currentSegment.discussion_question && (
            <View style={styles.discussionBox}>
              <View style={styles.discussionHeader}>
                <Ionicons name="chatbubble-ellipses" size={20} color="#92400e" />
                <Text style={styles.discussionTitle}>Let's Talk!</Text>
              </View>
              <Text style={styles.discussionQuestion}>
                {currentSegment.discussion_question}
              </Text>
            </View>
          )}
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
              color={isFirstSegment ? '#d1d5db' : '#3b82f6'}
            />
            <Text style={[styles.navButtonText, isFirstSegment && styles.navButtonTextDisabled]}>
              Previous
            </Text>
          </TouchableOpacity>

          {isLastSegment ? (
            <TouchableOpacity
              style={styles.finishButton}
              onPress={() => router.back()}
            >
              <Text style={styles.finishButtonText}>Finish</Text>
              <Ionicons name="checkmark" size={24} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.nextButton} onPress={goToNext}>
              <Text style={styles.nextButtonText}>Next</Text>
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
    backgroundColor: '#fef3c7', // Warm yellow background
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
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
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
    backgroundColor: '#3b82f6',
    width: 24,
  },
  progressDotCompleted: {
    backgroundColor: '#93c5fd',
  },
  progressText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
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
  },
  narrative: {
    fontSize: 18,
    lineHeight: 28,
    color: '#1f2937',
  },
  discussionBox: {
    backgroundColor: '#fef9c3',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#fde047',
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
    color: '#3b82f6',
    marginLeft: 4,
  },
  navButtonTextDisabled: {
    color: '#d1d5db',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
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
