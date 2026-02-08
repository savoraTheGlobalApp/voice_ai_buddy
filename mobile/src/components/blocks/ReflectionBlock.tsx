import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReflectionBlock as ReflectionBlockType } from '../../types/stories';

interface Props {
  block: ReflectionBlockType;
  language: 'en' | 'hi';
}

export function ReflectionBlockComponent({ block, language }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="bulb-outline" size={24} color="#7c3aed" />
        <Text style={styles.headerText}>
          {language === 'en' ? 'Pause & Think' : 'रुकें और सोचें'}
        </Text>
      </View>

      {block.prompt && (
        <Text style={[styles.prompt, language === 'hi' && styles.hindiText]}>
          {block.prompt[language]}
        </Text>
      )}

      <Text style={[styles.question, language === 'hi' && styles.hindiQuestion]}>
        {block.question[language]}
      </Text>

      {block.pauseDuration && (
        <View style={styles.pauseIndicator}>
          <Ionicons name="time-outline" size={16} color="#a78bfa" />
          <Text style={styles.pauseText}>
            {language === 'en'
              ? `Take ${block.pauseDuration} seconds...`
              : `${block.pauseDuration} सेकंड लें...`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f3ff',
    borderRadius: 16,
    padding: 20,
    marginVertical: 12,
    borderWidth: 2,
    borderColor: '#c4b5fd',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7c3aed',
    marginLeft: 8,
  },
  prompt: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  hindiText: {
    fontSize: 16,
    lineHeight: 24,
  },
  question: {
    fontSize: 18,
    lineHeight: 28,
    color: '#5b21b6',
    fontWeight: '500',
  },
  hindiQuestion: {
    fontSize: 20,
    lineHeight: 32,
  },
  pauseIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    opacity: 0.7,
  },
  pauseText: {
    fontSize: 12,
    color: '#a78bfa',
    marginLeft: 6,
    fontStyle: 'italic',
  },
});
