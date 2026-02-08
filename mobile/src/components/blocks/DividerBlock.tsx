import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { DividerBlock as DividerBlockType } from '../../types/stories';

interface Props {
  block: DividerBlockType;
}

export function DividerBlockComponent({ block }: Props) {
  const getDividerContent = () => {
    switch (block.style) {
      case 'dots':
        return <Text style={styles.dotsText}>• • •</Text>;
      case 'stars':
        return <Text style={styles.starsText}>✦ ✦ ✦</Text>;
      case 'om':
        return <Text style={styles.omText}>ॐ</Text>;
      case 'line':
      default:
        return <View style={styles.line} />;
    }
  };

  return (
    <View style={styles.container}>
      {getDividerContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
    paddingVertical: 8,
  },
  line: {
    width: 80,
    height: 2,
    backgroundColor: '#e5e7eb',
    borderRadius: 1,
  },
  dotsText: {
    fontSize: 16,
    color: '#9ca3af',
    letterSpacing: 8,
  },
  starsText: {
    fontSize: 14,
    color: '#f59e0b',
    letterSpacing: 8,
  },
  omText: {
    fontSize: 28,
    color: '#f97316',
  },
});
