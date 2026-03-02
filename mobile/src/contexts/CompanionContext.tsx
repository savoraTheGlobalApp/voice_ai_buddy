import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Storage keys ──────────────────────────────────────────────────────────────
const KEYS = {
  name:         '@companion_name',
  childName:    '@companion_child_name',
  lastSeen:     '@companion_last_seen',
  lastCategory: '@companion_last_story',
};

// ── Greeting pool ─────────────────────────────────────────────────────────────
// {companion} = companion's name (e.g. "Leo"), {child} = child's name
const GREETINGS = {
  firstTime: [
    "Hi! Tap my name badge to give me a name! 🐱",
    "Hello! I've been waiting for you! What's my name?",
  ],
  morning: [
    "Good morning, {child}! I'm {companion} — ready for adventure! ☀️",
    "Rise and shine, {child}! I'm {companion} and the stories are waiting! 🌅",
    "{child}, it's morning! I'm {companion} — adventure time! 🌞",
    "Morning, {child}! I'm {companion} — I dreamed about stories all night! 🌙",
    "Wakey wakey, {child}! I'm {companion} — let's go! 🌈",
  ],
  afternoon: [
    "Hi, {child}! I'm {companion} — perfect time for a story! 📖",
    "Hello, {child}! I'm {companion} — what shall we explore? 💭",
    "Hey {child}! I'm {companion} — ready to learn something amazing? 🎭",
    "Afternoon, {child}! I'm {companion} — I've been thinking about you! 😊",
    "Hi {child}! I'm {companion} — a story a day keeps boredom away! 🌟",
  ],
  evening: [
    "Good evening, {child}! I'm {companion} — one more story? 🌆",
    "Evening, {child}! I'm {companion} — let's end the day with a great tale! 🌇",
    "Hi {child}! I'm {companion} — the perfect time for a magical story! ✨",
    "Hey {child}! I'm {companion} — stories taste better in the evening! 🍵",
    "Evening, {child}! I'm {companion} — what adventure today? 🌙",
  ],
  night: [
    "Ooh {child}, a bedtime story! I'm {companion} — my favourite time! 🌙",
    "Night-time stories are the best! I'm {companion} — shall we, {child}? ⭐",
    "Shh {child}, I'm {companion} — let's have a quiet bedtime story! 🌜",
    "Sweet dreams start with great stories! I'm {companion}, {child}! 💤",
    "One last story, {child}? I'm {companion} — let's go! 🛏️",
  ],
  returning: [
    "You're back, {child}! I'm {companion} and I missed you! 🎉",
    "Yay, {child} is back! I'm {companion} — time for an adventure! 🌈",
    "{child}! I'm {companion} and I was so lonely without you! 🥺",
  ],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fmt(template: string, companionName: string, childName: string | null): string {
  const child = childName?.trim() || 'friend';
  return template
    .replace(/{companion}/g, companionName)
    .replace(/{child}/g, child);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function buildGreeting(
  name: string | null,
  childName: string | null,
  lastSeen: string | null,
): string {
  if (!name || !lastSeen) return pick(GREETINGS.firstTime);

  const daysSince = daysBetween(new Date(), new Date(lastSeen));
  if (daysSince >= 2) return fmt(pick(GREETINGS.returning), name, childName);

  const hour = new Date().getHours();
  if (hour >= 5  && hour < 12) return fmt(pick(GREETINGS.morning),   name, childName);
  if (hour >= 12 && hour < 17) return fmt(pick(GREETINGS.afternoon), name, childName);
  if (hour >= 17 && hour < 21) return fmt(pick(GREETINGS.evening),   name, childName);
  return fmt(pick(GREETINGS.night), name, childName);
}

// ── Context ───────────────────────────────────────────────────────────────────
interface CompanionContextValue {
  name: string | null;       // companion's name (e.g. "Leo")
  childName: string | null;  // child's name (e.g. "Arjun")
  isNamed: boolean;
  greeting: string;
  isLoaded: boolean;
  setName: (name: string) => Promise<void>;
  setChildName: (name: string) => Promise<void>;
  recordStorySeen: (category: string) => Promise<void>;
  refreshGreeting: () => void;
}

const CompanionContext = createContext<CompanionContextValue>({
  name: null,
  childName: null,
  isNamed: false,
  greeting: '',
  isLoaded: false,
  setName: async () => {},
  setChildName: async () => {},
  recordStorySeen: async () => {},
  refreshGreeting: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function CompanionProvider({ children }: { children: React.ReactNode }) {
  const [name, setNameState] = useState<string | null>(null);
  const [childName, setChildNameState] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [greeting, setGreeting] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      const [storedName, storedChildName, storedLastSeen] = await Promise.all([
        AsyncStorage.getItem(KEYS.name),
        AsyncStorage.getItem(KEYS.childName),
        AsyncStorage.getItem(KEYS.lastSeen),
      ]);
      setNameState(storedName);
      setChildNameState(storedChildName);
      setLastSeen(storedLastSeen);
      setGreeting(buildGreeting(storedName, storedChildName, storedLastSeen));
      setIsLoaded(true);
    })();
  }, []);

  const setName = useCallback(async (newName: string) => {
    const now = new Date().toISOString();
    const effectiveLastSeen = lastSeen ?? now;
    await Promise.all([
      AsyncStorage.setItem(KEYS.name, newName),
      // Seed lastSeen on first naming so greeting picks time-of-day on next open
      ...(!lastSeen ? [AsyncStorage.setItem(KEYS.lastSeen, now)] : []),
    ]);
    setNameState(newName);
    if (!lastSeen) setLastSeen(now);
    setGreeting(buildGreeting(newName, childName, effectiveLastSeen));
  }, [lastSeen, childName]);

  const setChildName = useCallback(async (newChildName: string) => {
    await AsyncStorage.setItem(KEYS.childName, newChildName);
    setChildNameState(newChildName);
    setGreeting(buildGreeting(name, newChildName, lastSeen));
  }, [name, lastSeen]);

  const recordStorySeen = useCallback(async (category: string) => {
    const now = new Date().toISOString();
    await Promise.all([
      AsyncStorage.setItem(KEYS.lastSeen, now),
      AsyncStorage.setItem(KEYS.lastCategory, category),
    ]);
    setLastSeen(now);
  }, []);

  const refreshGreeting = useCallback(() => {
    setGreeting(buildGreeting(name, childName, lastSeen));
  }, [name, childName, lastSeen]);

  return (
    <CompanionContext.Provider value={{
      name,
      childName,
      isNamed: !!name,
      greeting,
      isLoaded,
      setName,
      setChildName,
      recordStorySeen,
      refreshGreeting,
    }}>
      {children}
    </CompanionContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useCompanion() {
  return useContext(CompanionContext);
}
