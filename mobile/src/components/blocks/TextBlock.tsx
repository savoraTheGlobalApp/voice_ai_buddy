import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { TextBlock as TextBlockType } from '../../types/stories';

interface Props {
  block: TextBlockType;
  language: 'en' | 'hi';
}

export function TextBlockComponent({ block, language }: Props) {
  const getStyleForVariant = () => {
    switch (block.style) {
      case 'emphasized':
        return styles.emphasized;
      case 'whisper':
        return styles.whisper;
      case 'dramatic':
        return styles.dramatic;
      default:
        return styles.normal;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[
        styles.text,
        getStyleForVariant(),
        language === 'hi' && styles.hindiText
      ]}>
        {block.content[language]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  text: {
    fontSize: 18,
    lineHeight: 30,
    color: '#1f2937',
  },
  hindiText: {
    fontSize: 20,
    lineHeight: 34,
    letterSpacing: 0.5,
  },
  normal: {
    fontWeight: '400',
  },
  emphasized: {
    fontWeight: '600',
    fontStyle: 'italic',
  },
  whisper: {
    fontStyle: 'italic',
    color: '#6b7280',
    fontSize: 16,
  },
  dramatic: {
    fontWeight: '700',
    fontSize: 20,
    textAlign: 'center',
  },
});
