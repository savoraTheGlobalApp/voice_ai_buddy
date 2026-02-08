import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { StoryBodyBlock as StoryBodyBlockType } from '../../types/stories';

interface Props {
  block: StoryBodyBlockType;
  language: 'en' | 'hi';
}

export function StoryBodyBlockComponent({ block, language }: Props) {
  return (
    <View style={styles.container}>
      <Text style={[
        styles.text,
        language === 'hi' && styles.hindiText
      ]}>
        {block.content[language]}
      </Text>
      {block.characterHighlights && block.characterHighlights.length > 0 && (
        <View style={styles.characterTags}>
          {block.characterHighlights.map((char, idx) => (
            <View key={idx} style={styles.characterTag}>
              <Text style={styles.characterTagText}>{char}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderTopWidth: 3,
    borderTopColor: '#f97316',
  },
  text: {
    fontSize: 18,
    lineHeight: 32,
    letterSpacing: 0.3,
    color: '#1f2937',
  },
  hindiText: {
    fontSize: 20,
    lineHeight: 36,
    letterSpacing: 0.5,
  },
  characterTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    gap: 8,
  },
  characterTag: {
    backgroundColor: '#fff7ed',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fb923c',
  },
  characterTagText: {
    fontSize: 12,
    color: '#ea580c',
    fontWeight: '500',
  },
});
