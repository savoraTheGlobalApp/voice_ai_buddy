import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ContentBlock,
  ContentDisplayConfig,
  BlockBasedContent,
} from '../../types/stories';
import { BlockRenderer } from './BlockRenderer';

interface ContentViewerProps {
  content: BlockBasedContent;
  language: 'en' | 'hi';
  onLanguageToggle: () => void;
  onComplete?: () => void;
  onQuizAnswer?: (blockId: string, isCorrect: boolean) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function ContentViewer({
  content,
  language,
  onLanguageToggle,
  onComplete,
  onQuizAnswer,
}: ContentViewerProps) {
  const { blocks, display, title, metadata } = content;
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  const isScrollNavigation = display.navigation === 'scroll';
  const isPaginated = display.navigation === 'paginated';

  // Get theme colors based on display config
  const getThemeColors = () => {
    switch (display.theme) {
      case 'bedtime':
        return {
          background: '#1e1b4b',
          text: '#e0e7ff',
          accent: '#6366f1',
        };
      case 'adventure':
        return {
          background: '#fff7ed',
          text: '#1f2937',
          accent: '#f97316',
        };
      case 'calm':
        return {
          background: '#f0fdf4',
          text: '#1f2937',
          accent: '#10b981',
        };
      default:
        return {
          background: '#fff7ed',
          text: '#1f2937',
          accent: '#f97316',
        };
    }
  };

  const themeColors = getThemeColors();

  // Animate on block change (for paginated mode)
  useEffect(() => {
    if (isPaginated) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [currentBlockIndex, isPaginated]);

  const goToNextBlock = useCallback(() => {
    if (currentBlockIndex < blocks.length - 1) {
      setCurrentBlockIndex((prev) => prev + 1);
    } else {
      onComplete?.();
    }
  }, [currentBlockIndex, blocks.length, onComplete]);

  const goToPrevBlock = useCallback(() => {
    if (currentBlockIndex > 0) {
      setCurrentBlockIndex((prev) => prev - 1);
    }
  }, [currentBlockIndex]);

  const isFirstBlock = currentBlockIndex === 0;
  const isLastBlock = currentBlockIndex === blocks.length - 1;

  // Render scroll-based view
  const renderScrollView = () => (
    <ScrollView
      ref={scrollViewRef}
      style={[styles.scrollContainer, { backgroundColor: themeColors.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Title */}
      <Text style={[styles.title, { color: themeColors.text }]}>
        {title[language]}
      </Text>

      {/* Reading time & values */}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={14} color={themeColors.accent} />
          <Text style={[styles.metaText, { color: themeColors.text }]}>
            {metadata.reading_time_minutes} min
          </Text>
        </View>
        {metadata.values.slice(0, 2).map((value) => (
          <View key={value} style={[styles.valueBadge, { borderColor: themeColors.accent }]}>
            <Text style={[styles.valueText, { color: themeColors.accent }]}>
              {value}
            </Text>
          </View>
        ))}
      </View>

      {/* All blocks */}
      {blocks.map((block) => (
        <BlockRenderer
          key={block.id}
          block={block}
          language={language}
          onQuizAnswer={onQuizAnswer}
        />
      ))}

      {/* Complete button */}
      <TouchableOpacity
        style={[styles.completeButton, { backgroundColor: themeColors.accent }]}
        onPress={onComplete}
      >
        <Text style={styles.completeButtonText}>
          {language === 'en' ? 'Finish' : 'समाप्त'}
        </Text>
        <Ionicons name="checkmark" size={20} color="#fff" />
      </TouchableOpacity>
    </ScrollView>
  );

  // Render paginated view
  const renderPaginatedView = () => {
    const currentBlock = blocks[currentBlockIndex];

    return (
      <View style={[styles.paginatedContainer, { backgroundColor: themeColors.background }]}>
        {/* Progress indicator */}
        {display.showProgress !== false && (
          <View style={styles.progressContainer}>
            {blocks.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.progressDot,
                  index === currentBlockIndex && [styles.progressDotActive, { backgroundColor: themeColors.accent }],
                  index < currentBlockIndex && styles.progressDotCompleted,
                ]}
              />
            ))}
          </View>
        )}

        <Text style={styles.progressText}>
          {currentBlockIndex + 1} / {blocks.length}
        </Text>

        {/* Current block content */}
        <ScrollView
          style={styles.blockContent}
          contentContainerStyle={styles.blockContentContainer}
          showsVerticalScrollIndicator={false}
        >
          <BlockRenderer
            key={currentBlock.id}
            block={currentBlock}
            language={language}
            onQuizAnswer={onQuizAnswer}
            fadeAnim={fadeAnim}
          />
        </ScrollView>

        {/* Navigation buttons */}
        <View style={styles.navigationContainer}>
          <TouchableOpacity
            style={[styles.navButton, isFirstBlock && styles.navButtonDisabled]}
            onPress={goToPrevBlock}
            disabled={isFirstBlock}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={isFirstBlock ? '#d1d5db' : themeColors.accent}
            />
            <Text style={[styles.navButtonText, isFirstBlock && styles.navButtonTextDisabled]}>
              {language === 'en' ? 'Previous' : 'पिछला'}
            </Text>
          </TouchableOpacity>

          {isLastBlock ? (
            <TouchableOpacity
              style={[styles.finishButton, { backgroundColor: '#10b981' }]}
              onPress={onComplete}
            >
              <Text style={styles.finishButtonText}>
                {language === 'en' ? 'Finish' : 'समाप्त'}
              </Text>
              <Ionicons name="checkmark" size={24} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.nextButton, { backgroundColor: themeColors.accent }]}
              onPress={goToNextBlock}
            >
              <Text style={styles.nextButtonText}>
                {language === 'en' ? 'Next' : 'अगला'}
              </Text>
              <Ionicons name="chevron-forward" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return isScrollNavigation ? renderScrollView() : renderPaginatedView();
}

const styles = StyleSheet.create({
  // Scroll view styles
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '500',
  },
  valueBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  valueText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  completeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  // Paginated view styles
  paginatedContainer: {
    flex: 1,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 3,
  },
  progressDotActive: {
    width: 20,
  },
  progressDotCompleted: {
    backgroundColor: '#fb923c',
  },
  progressText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
    marginBottom: 8,
  },
  blockContent: {
    flex: 1,
  },
  blockContentContainer: {
    padding: 20,
    paddingBottom: 100,
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
