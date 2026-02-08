import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useStaticStory } from '../../../src/hooks/useStaticStories';

export default function SacredStoriesLibrary() {
  // For MVP, we only have one story: maha-001
  const { data: story, isLoading } = useStaticStory('maha-001');

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>Loading sacred stories...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!story) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>No stories available</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header Section */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Sacred Stories from Indian Mythology</Text>
          <Text style={styles.headerSubtitle}>
            Learn timeless values through ancient tales
          </Text>
        </View>

        {/* Story Card */}
        <TouchableOpacity
          style={styles.storyCard}
          onPress={() => router.push(`/(app)/sacred-stories/block-viewer?contentId=${story.story_id}`)}
          activeOpacity={0.7}
        >
          {/* Category Badge */}
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>
              {story.category.charAt(0).toUpperCase() + story.category.slice(1)}
            </Text>
          </View>

          {/* Title - Bilingual */}
          <Text style={styles.storyTitleEn}>{story.title.en}</Text>
          <Text style={styles.storyTitleHi}>{story.title.hi}</Text>

          {/* Metadata Row */}
          <View style={styles.metadataRow}>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataIcon}>⏱️</Text>
              <Text style={styles.metadataText}>{story.metadata.reading_time} min</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataIcon}>👶</Text>
              <Text style={styles.metadataText}>
                Ages {story.metadata.recommended_age[0]}-{story.metadata.recommended_age[1]}
              </Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataIcon}>📚</Text>
              <Text style={styles.metadataText}>{story.segments.length} parts</Text>
            </View>
          </View>

          {/* Values Chips */}
          <View style={styles.valuesContainer}>
            {story.values.map((value) => (
              <View key={value} style={styles.valueChip}>
                <Text style={styles.valueText}>{value}</Text>
              </View>
            ))}
          </View>

          {/* Read Button */}
          <View style={styles.readButton}>
            <Text style={styles.readButtonText}>Begin the Katha →</Text>
          </View>
        </TouchableOpacity>

        {/* Characters Section */}
        <View style={styles.charactersSection}>
          <Text style={styles.sectionTitle}>Character Collection</Text>
          <TouchableOpacity
            style={styles.charactersButton}
            onPress={() => router.push('/(app)/sacred-stories/characters')}
          >
            <Text style={styles.charactersButtonIcon}>👥</Text>
            <Text style={styles.charactersButtonText}>View Your Characters</Text>
          </TouchableOpacity>
        </View>

        {/* Block Viewer Test (Dev Only) */}
        {__DEV__ && (
          <View style={styles.devSection}>
            <Text style={styles.devSectionTitle}>Dev Testing</Text>
            <TouchableOpacity
              style={styles.devButton}
              onPress={() => router.push('/(app)/sacred-stories/block-viewer')}
            >
              <Text style={styles.devButtonIcon}>🧪</Text>
              <Text style={styles.devButtonText}>Test Block-Based Content</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  storyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#f97316',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 12,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f97316',
    textTransform: 'uppercase',
  },
  storyTitleEn: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  storyTitleHi: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 16,
  },
  metadataRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 16,
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metadataIcon: {
    fontSize: 16,
  },
  metadataText: {
    fontSize: 14,
    color: '#6b7280',
  },
  valuesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
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
  readButton: {
    backgroundColor: '#f97316',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  readButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  charactersSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
  },
  charactersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff7ed',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fb923c',
    gap: 8,
  },
  charactersButtonIcon: {
    fontSize: 24,
  },
  charactersButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f97316',
  },
  devSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  devSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  devButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#9ca3af',
    borderStyle: 'dashed',
    gap: 8,
  },
  devButtonIcon: {
    fontSize: 20,
  },
  devButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
});
