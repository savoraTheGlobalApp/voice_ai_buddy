import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { ValueHighlightBlock as ValueHighlightBlockType } from '../../types/stories';

// Value icons mapping
const VALUE_ICONS: Record<string, string> = {
  courage: '🦁',
  dharma: '☸️',
  duty: '⚖️',
  honesty: '💎',
  truth: '🌟',
  kindness: '💝',
  compassion: '🤲',
  devotion: '🙏',
  patience: '🌊',
  wisdom: '🦉',
  respect: '🙇',
  gratitude: '🌸',
  friendship: '🤝',
  perseverance: '🏔️',
  selfcontrol: '🧘',
  sacrifice: '🔥',
  loyalty: '🛡️',
};

interface Props {
  block: ValueHighlightBlockType;
  language: 'en' | 'hi';
}

export function ValueHighlightBlockComponent({ block, language }: Props) {
  const icon = block.icon || VALUE_ICONS[block.value.toLowerCase()] || '✨';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <View style={styles.valueBadge}>
          <Text style={styles.valueText}>{block.value}</Text>
        </View>
      </View>

      <Text style={[styles.explanation, language === 'hi' && styles.hindiExplanation]}>
        {block.explanation[language]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ecfdf5',
    borderRadius: 16,
    padding: 20,
    marginVertical: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    fontSize: 28,
    marginRight: 12,
  },
  valueBadge: {
    backgroundColor: '#d1fae5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  valueText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  explanation: {
    fontSize: 16,
    lineHeight: 26,
    color: '#065f46',
  },
  hindiExplanation: {
    fontSize: 18,
    lineHeight: 30,
  },
});
