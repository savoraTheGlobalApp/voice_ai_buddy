import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { CharacterIntroBlock as CharacterIntroBlockType } from '../../types/stories';

// Default character avatars
const CHARACTER_AVATARS: Record<string, string> = {
  krishna: '🦚',
  arjuna: '🏹',
  rama: '🏹',
  sita: '🌸',
  hanuman: '🐒',
  bhima: '💪',
  draupadi: '🔥',
  ravana: '👑',
  lakshman: '⚔️',
  ganesh: '🐘',
  shiva: '🔱',
  vishnu: '🪷',
};

interface Props {
  block: CharacterIntroBlockType;
  language: 'en' | 'hi';
}

export function CharacterIntroBlockComponent({ block, language }: Props) {
  const avatar = block.avatar || CHARACTER_AVATARS[block.characterId.toLowerCase()] || '👤';

  return (
    <View style={styles.container}>
      <View style={styles.avatarContainer}>
        <Text style={styles.avatar}>{avatar}</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.name, language === 'hi' && styles.hindiName]}>
          {block.name[language]}
        </Text>

        <View style={styles.traitBadge}>
          <Text style={[styles.traitText, language === 'hi' && styles.hindiTrait]}>
            {block.trait[language]}
          </Text>
        </View>

        <Text style={[styles.description, language === 'hi' && styles.hindiDescription]}>
          {block.description[language]}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: '#fcd34d',
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 3,
    borderColor: '#f59e0b',
  },
  avatar: {
    fontSize: 32,
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  hindiName: {
    fontSize: 20,
  },
  traitBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  traitText: {
    fontSize: 12,
    color: '#b45309',
    fontWeight: '600',
  },
  hindiTrait: {
    fontSize: 14,
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
    color: '#4b5563',
  },
  hindiDescription: {
    fontSize: 16,
    lineHeight: 26,
  },
});
