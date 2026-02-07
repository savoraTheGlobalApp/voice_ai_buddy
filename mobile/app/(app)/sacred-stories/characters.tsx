import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserCharacters } from '../../../src/hooks/useStaticStories';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useState } from 'react';

type Language = 'en' | 'hi';

export default function CharacterCollectionScreen() {
  const { currentUser } = useAuth();
  const { data, isLoading } = useUserCharacters(currentUser?.uid);
  const [language, setLanguage] = useState<Language>('en');

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === 'en' ? 'hi' : 'en'));
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#f97316" />
          <Text style={styles.loadingText}>Loading your collection...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const characters = data?.characters || [];
  const totalUnlocked = data?.total_unlocked || 0;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header with language toggle */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            {language === 'en' ? 'Character Collection' : 'पात्र संग्रह'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {language === 'en'
              ? `${totalUnlocked} character${totalUnlocked !== 1 ? 's' : ''} unlocked`
              : `${totalUnlocked} पात्र अनलॉक किए गए`
            }
          </Text>
        </View>
        <TouchableOpacity onPress={toggleLanguage} style={styles.languageToggle}>
          <Text style={styles.languageToggleText}>
            {language === 'en' ? 'हिं' : 'EN'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {characters.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📚</Text>
            <Text style={styles.emptyStateTitle}>
              {language === 'en' ? 'No characters yet!' : 'अभी तक कोई पात्र नहीं!'}
            </Text>
            <Text style={styles.emptyStateText}>
              {language === 'en'
                ? 'Complete stories to unlock mythological characters'
                : 'पौराणिक पात्रों को अनलॉक करने के लिए कहानियां पूरी करें'
              }
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {characters.map((character) => (
              <View key={character.character_id} style={styles.characterCard}>
                {/* Avatar */}
                <View style={styles.avatarContainer}>
                  <Text style={styles.avatar}>{character.character_avatar}</Text>
                </View>

                {/* Character Name */}
                <Text style={[styles.characterName, language === 'hi' && styles.characterNameHindi]}>
                  {character.character_name[language]}
                </Text>

                {/* Rarity Badge */}
                <View style={[styles.rarityBadge, styles[`rarity${character.rarity.charAt(0).toUpperCase() + character.rarity.slice(1)}`]]}>
                  <Text style={styles.rarityText}>
                    {character.rarity === 'common' && (language === 'en' ? 'Common' : 'सामान्य')}
                    {character.rarity === 'rare' && (language === 'en' ? 'Rare' : 'दुर्लभ')}
                    {character.rarity === 'legendary' && (language === 'en' ? 'Legendary' : 'महाकाव्य')}
                  </Text>
                </View>

                {/* Key Trait */}
                <View style={styles.traitContainer}>
                  <Text style={styles.traitLabel}>
                    {language === 'en' ? 'Key Trait:' : 'मुख्य गुण:'}
                  </Text>
                  <Text style={[styles.traitText, language === 'hi' && styles.traitTextHindi]}>
                    {character.key_trait[language]}
                  </Text>
                </View>

                {/* Fun Fact */}
                <View style={styles.funFactContainer}>
                  <Text style={styles.funFactLabel}>💡 {language === 'en' ? 'Fun Fact' : 'मजेदार तथ्य'}</Text>
                  <Text style={[styles.funFactText, language === 'hi' && styles.funFactTextHindi]}>
                    {character.fun_fact[language]}
                  </Text>
                </View>

                {/* Description */}
                <Text style={[styles.characterDescription, language === 'hi' && styles.characterDescriptionHindi]}>
                  {character.character_description[language]}
                </Text>

                {/* Stories Read Count */}
                <View style={styles.storiesCount}>
                  <Text style={styles.storiesCountText}>
                    📖 {character.stories_read?.length || 0} {language === 'en' ? 'stories' : 'कहानियां'}
                  </Text>
                </View>

                {/* Unlocked Date */}
                {character.unlocked_at && (
                  <Text style={styles.unlockedDate}>
                    {language === 'en' ? 'Unlocked:' : 'अनलॉक:'} {new Date(character.unlocked_at).toLocaleDateString()}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  languageToggle: {
    backgroundColor: '#f97316',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  languageToggleText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  content: {
    padding: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  grid: {
    gap: 16,
  },
  characterCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#f97316',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarContainer: {
    alignSelf: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff7ed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 3,
    borderColor: '#fb923c',
  },
  avatar: {
    fontSize: 48,
  },
  characterName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  characterNameHindi: {
    fontSize: 22,
  },
  rarityBadge: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  rarityCommon: {
    backgroundColor: '#d1d5db',
  },
  rarityRare: {
    backgroundColor: '#93c5fd',
  },
  rarityLegendary: {
    backgroundColor: '#fbbf24',
  },
  rarityText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
    textTransform: 'uppercase',
  },
  traitContainer: {
    backgroundColor: '#fff7ed',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#f97316',
  },
  traitLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
    marginBottom: 4,
  },
  traitText: {
    fontSize: 14,
    color: '#78350f',
    fontWeight: '500',
  },
  traitTextHindi: {
    fontSize: 16,
  },
  funFactContainer: {
    backgroundColor: '#fef9c3',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  funFactLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
    marginBottom: 4,
  },
  funFactText: {
    fontSize: 13,
    color: '#78350f',
    fontStyle: 'italic',
  },
  funFactTextHindi: {
    fontSize: 15,
  },
  characterDescription: {
    fontSize: 14,
    lineHeight: 22,
    color: '#6b7280',
    marginBottom: 12,
  },
  characterDescriptionHindi: {
    fontSize: 16,
    lineHeight: 26,
  },
  storiesCount: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  storiesCountText: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '500',
  },
  unlockedDate: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
