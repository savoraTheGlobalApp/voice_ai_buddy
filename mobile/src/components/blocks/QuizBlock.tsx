import React, { useState } from 'react';
import { Text, StyleSheet, View, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { QuizBlock as QuizBlockType } from '../../types/stories';

interface Props {
  block: QuizBlockType;
  language: 'en' | 'hi';
  onAnswer?: (isCorrect: boolean) => void;
}

export function QuizBlockComponent({ block, language, onAnswer }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  const handleSelect = (index: number) => {
    if (showResult) return;

    setSelectedIndex(index);
    setShowResult(true);

    const isCorrect = index === block.correctIndex;
    onAnswer?.(isCorrect);
  };

  const getOptionStyle = (index: number) => {
    if (!showResult) return styles.option;

    if (index === block.correctIndex) {
      return [styles.option, styles.correctOption];
    }
    if (index === selectedIndex && index !== block.correctIndex) {
      return [styles.option, styles.incorrectOption];
    }
    return [styles.option, styles.dimmedOption];
  };

  const getOptionTextStyle = (index: number) => {
    if (!showResult) return styles.optionText;

    if (index === block.correctIndex) {
      return [styles.optionText, styles.correctOptionText];
    }
    if (index === selectedIndex && index !== block.correctIndex) {
      return [styles.optionText, styles.incorrectOptionText];
    }
    return [styles.optionText, styles.dimmedOptionText];
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="help-circle" size={24} color="#0284c7" />
        <Text style={styles.headerText}>
          {language === 'en' ? 'Quick Check' : 'त्वरित जाँच'}
        </Text>
      </View>

      <Text style={[styles.question, language === 'hi' && styles.hindiQuestion]}>
        {block.question[language]}
      </Text>

      <View style={styles.optionsContainer}>
        {block.options.map((option, idx) => (
          <TouchableOpacity
            key={idx}
            style={getOptionStyle(idx)}
            onPress={() => handleSelect(idx)}
            disabled={showResult}
            activeOpacity={0.7}
          >
            <View style={styles.optionContent}>
              <View style={styles.optionBadge}>
                <Text style={styles.optionBadgeText}>
                  {String.fromCharCode(65 + idx)}
                </Text>
              </View>
              <Text style={[
                getOptionTextStyle(idx),
                language === 'hi' && styles.hindiOption
              ]}>
                {option[language]}
              </Text>
            </View>
            {showResult && idx === block.correctIndex && (
              <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
            )}
            {showResult && idx === selectedIndex && idx !== block.correctIndex && (
              <Ionicons name="close-circle" size={24} color="#dc2626" />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {showResult && (
        <View style={[
          styles.explanationContainer,
          selectedIndex === block.correctIndex
            ? styles.correctExplanation
            : styles.incorrectExplanation
        ]}>
          <Ionicons
            name={selectedIndex === block.correctIndex ? 'sparkles' : 'information-circle'}
            size={20}
            color={selectedIndex === block.correctIndex ? '#16a34a' : '#f59e0b'}
          />
          <Text style={[styles.explanationText, language === 'hi' && styles.hindiExplanation]}>
            {block.explanation[language]}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f0f9ff',
    borderRadius: 16,
    padding: 20,
    marginVertical: 12,
    borderWidth: 2,
    borderColor: '#7dd3fc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0284c7',
    marginLeft: 8,
  },
  question: {
    fontSize: 17,
    lineHeight: 26,
    color: '#0c4a6e',
    fontWeight: '500',
    marginBottom: 16,
  },
  hindiQuestion: {
    fontSize: 19,
    lineHeight: 30,
  },
  optionsContainer: {
    gap: 10,
  },
  option: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#e0f2fe',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0ea5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  optionText: {
    fontSize: 15,
    color: '#334155',
    flex: 1,
  },
  hindiOption: {
    fontSize: 17,
    lineHeight: 24,
  },
  correctOption: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },
  incorrectOption: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  dimmedOption: {
    opacity: 0.5,
  },
  correctOptionText: {
    color: '#16a34a',
    fontWeight: '600',
  },
  incorrectOptionText: {
    color: '#dc2626',
  },
  dimmedOptionText: {
    color: '#94a3b8',
  },
  explanationContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
  },
  correctExplanation: {
    backgroundColor: '#dcfce7',
  },
  incorrectExplanation: {
    backgroundColor: '#fef3c7',
  },
  explanationText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#374151',
    marginLeft: 8,
    flex: 1,
  },
  hindiExplanation: {
    fontSize: 16,
    lineHeight: 24,
  },
});
