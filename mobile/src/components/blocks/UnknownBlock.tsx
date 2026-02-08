import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ContentBlock } from '../../types/stories';

interface Props {
  block: ContentBlock;
}

export function UnknownBlockComponent({ block }: Props) {
  // In production, we might want to hide unknown blocks entirely
  // For development, we show a placeholder
  if (__DEV__) {
    return (
      <View style={styles.container}>
        <Ionicons name="help-circle-outline" size={24} color="#9ca3af" />
        <Text style={styles.text}>
          Unknown block type: {block.type}
        </Text>
      </View>
    );
  }

  // In production, return null to gracefully skip unknown blocks
  return null;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  text: {
    fontSize: 14,
    color: '#6b7280',
    marginLeft: 8,
    fontStyle: 'italic',
  },
});
