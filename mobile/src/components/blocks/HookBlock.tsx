import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { HookBlock as HookBlockType } from '../../types/stories';

interface Props {
  block: HookBlockType;
  language: 'en' | 'hi';
}

export function HookBlockComponent({ block, language }: Props) {
  return (
    <View style={styles.container}>
      {block.icon && (
        <Text style={styles.icon}>{block.icon}</Text>
      )}
      <Text style={[
        styles.text,
        language === 'hi' && styles.hindiText
      ]}>
        {block.content[language]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fef3c7',
    borderRadius: 16,
    padding: 20,
    marginVertical: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
    alignItems: 'center',
  },
  icon: {
    fontSize: 32,
    marginBottom: 12,
  },
  text: {
    fontSize: 20,
    lineHeight: 32,
    color: '#92400e',
    fontWeight: '600',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  hindiText: {
    fontSize: 22,
    lineHeight: 36,
    letterSpacing: 0.5,
  },
});
