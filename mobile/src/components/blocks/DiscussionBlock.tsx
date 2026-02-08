import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DiscussionBlock as DiscussionBlockType } from '../../types/stories';

interface Props {
  block: DiscussionBlockType;
  language: 'en' | 'hi';
}

export function DiscussionBlockComponent({ block, language }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="chatbubble-ellipses" size={20} color="#92400e" />
        <Text style={styles.headerText}>
          {language === 'en' ? "Let's Talk!" : 'बात करते हैं!'}
        </Text>
      </View>

      <Text style={[styles.question, language === 'hi' && styles.hindiQuestion]}>
        {block.question[language]}
      </Text>

      {block.hints && block.hints.length > 0 && (
        <View style={styles.hintsContainer}>
          <Text style={styles.hintsLabel}>
            {language === 'en' ? 'Hints:' : 'संकेत:'}
          </Text>
          {block.hints.map((hint, idx) => (
            <View key={idx} style={styles.hintRow}>
              <Text style={styles.hintBullet}>•</Text>
              <Text style={[styles.hintText, language === 'hi' && styles.hindiHint]}>
                {hint[language]}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff7ed',
    borderRadius: 16,
    padding: 20,
    marginVertical: 12,
    borderWidth: 2,
    borderColor: '#fb923c',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400e',
    marginLeft: 8,
  },
  question: {
    fontSize: 16,
    lineHeight: 24,
    color: '#78350f',
    fontStyle: 'italic',
  },
  hindiQuestion: {
    fontSize: 18,
    lineHeight: 28,
  },
  hintsContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#fed7aa',
  },
  hintsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9a3412',
    marginBottom: 8,
  },
  hintRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  hintBullet: {
    fontSize: 14,
    color: '#ea580c',
    marginRight: 8,
  },
  hintText: {
    fontSize: 14,
    color: '#c2410c',
    flex: 1,
  },
  hindiHint: {
    fontSize: 16,
    lineHeight: 22,
  },
});
