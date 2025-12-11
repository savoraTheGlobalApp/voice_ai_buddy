/**
 * Memory Analysis Module
 * Extracts interests, topics, and engagement patterns from user memories
 * For personalizing proactive questions
 */

import { UserMemory } from '@/lib/memories';

export interface InterestProfile {
  topics: string[];
  favoriteTopics: string[]; // Top 3 most mentioned
  engagementPatterns: {
    questionsAsked: number;
    factsShared: number;
    averageImportance: number;
  };
  learningStyle: 'curious' | 'creative' | 'analytical' | 'mixed';
}

/**
 * Extract topics from memory text using keyword matching
 */
const TOPIC_KEYWORDS: Record<string, string[]> = {
  animals: ['animal', 'dog', 'cat', 'bird', 'dinosaur', 'shark', 'elephant', 'tiger', 'lion', 'bear', 'fish', 'octopus', 'whale'],
  space: ['space', 'planet', 'star', 'moon', 'sun', 'mars', 'earth', 'astronaut', 'rocket', 'galaxy', 'universe'],
  nature: ['plant', 'tree', 'flower', 'ocean', 'mountain', 'forest', 'river', 'lake', 'beach'],
  science: ['science', 'experiment', 'magnet', 'electricity', 'gravity', 'energy', 'atom', 'molecule'],
  body: ['body', 'heart', 'brain', 'bone', 'muscle', 'blood', 'organ'],
  food: ['food', 'fruit', 'vegetable', 'banana', 'apple', 'pizza', 'ice cream', 'chocolate'],
  games: ['game', 'play', 'toy', 'lego', 'minecraft', 'puzzle', 'board game'],
  vehicles: ['car', 'truck', 'plane', 'train', 'boat', 'bike', 'vehicle'],
  colors: ['color', 'red', 'blue', 'green', 'yellow', 'purple', 'orange'],
  sports: ['sport', 'soccer', 'basketball', 'football', 'swimming', 'running'],
};

/**
 * Analyze memories to extract interest profile
 */
export function analyzeMemories(memories: UserMemory[]): InterestProfile {
  const topics: string[] = [];
  const topicCounts: Record<string, number> = {};
  let questionsAsked = 0;
  let factsShared = 0;
  let totalImportance = 0;
  
  memories.forEach(memory => {
    const text = memory.text.toLowerCase();
    totalImportance += memory.importance;
    
    // Count interaction types
    if (text.includes('?') || text.includes('ask') || text.includes('wonder')) {
      questionsAsked++;
    }
    if (text.includes('learn') || text.includes('know') || text.includes('fact')) {
      factsShared++;
    }
    
    // Extract topics
    Object.entries(TOPIC_KEYWORDS).forEach(([category, keywords]) => {
      keywords.forEach(keyword => {
        if (text.includes(keyword)) {
          if (!topics.includes(category)) {
            topics.push(category);
          }
          topicCounts[category] = (topicCounts[category] || 0) + memory.importance;
        }
      });
    });
  });
  
  // Get top 3 favorite topics by importance-weighted count
  const favoriteTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic);
  
  // Determine learning style
  const questionRatio = questionsAsked / Math.max(memories.length, 1);
  const factRatio = factsShared / Math.max(memories.length, 1);
  
  let learningStyle: InterestProfile['learningStyle'] = 'mixed';
  if (questionRatio > 0.5) {
    learningStyle = 'curious';
  } else if (factRatio > 0.5) {
    learningStyle = 'analytical';
  } else if (topics.includes('games') || topics.includes('creative')) {
    learningStyle = 'creative';
  }
  
  return {
    topics,
    favoriteTopics,
    engagementPatterns: {
      questionsAsked,
      factsShared,
      averageImportance: memories.length > 0 ? totalImportance / memories.length : 0,
    },
    learningStyle,
  };
}

/**
 * Find memories semantically similar to a target topic
 * For Phase 1: Simple keyword matching
 * Phase 2: Will use vector embeddings
 */
export function findRelatedMemories(memories: UserMemory[], targetTopic: string): UserMemory[] {
  const targetLower = targetTopic.toLowerCase();
  
  return memories.filter(memory => {
    const text = memory.text.toLowerCase();
    
    // Check if memory text contains target topic or related keywords
    if (text.includes(targetLower)) {
      return true;
    }
    
    // Check for related keywords
    const relatedKeywords = TOPIC_KEYWORDS[targetLower] || [];
    return relatedKeywords.some(keyword => text.includes(keyword));
  });
}

/**
 * Get personalized question hook based on memories
 */
export function getPersonalizedHook(memories: UserMemory[], userName?: string): string | null {
  if (memories.length === 0) {
    return null;
  }
  
  const profile = analyzeMemories(memories);
  
  if (profile.favoriteTopics.length > 0) {
    const topic = profile.favoriteTopics[0];
    const topicName = topic.charAt(0).toUpperCase() + topic.slice(1);
    
    if (userName) {
      return `I remember you love talking about ${topicName}!`;
    }
    return `You seem really interested in ${topicName}!`;
  }
  
  return null;
}

