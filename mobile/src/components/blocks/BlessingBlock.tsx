import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { BlessingBlock as BlessingBlockType } from '../../types/stories';

interface Props {
  block: BlessingBlockType;
  language: 'en' | 'hi';
}

export function BlessingBlockComponent({ block, language }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{block.icon || '🙏'}</Text>
      </View>

      <Text style={[styles.text, language === 'hi' && styles.hindiText]}>
        {block.content[language]}
      </Text>

      {block.character && (
        <Text style={styles.attribution}>
          {language === 'en' ? `— ${block.character}` : `— ${block.character}`}
        </Text>
      )}

      <View style={styles.decorativeLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e1b4b',
    borderRadius: 20,
    padding: 28,
    marginVertical: 16,
    alignItems: 'center',
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 32,
  },
  text: {
    fontSize: 18,
    lineHeight: 30,
    color: '#e0e7ff',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  hindiText: {
    fontSize: 20,
    lineHeight: 34,
    letterSpacing: 0.5,
  },
  attribution: {
    fontSize: 14,
    color: '#a5b4fc',
    marginTop: 12,
    fontStyle: 'italic',
  },
  decorativeLine: {
    width: 60,
    height: 2,
    backgroundColor: '#6366f1',
    marginTop: 16,
    borderRadius: 1,
  },
});
