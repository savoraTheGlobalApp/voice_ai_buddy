/**
 * useSoundEffects
 *
 * Preloads all UI sound effects on mount and exposes a single `play(name)`
 * function. Sounds are played at reduced volume so they never overpower
 * the narrator audio. Each effect is fire-and-forget — rapid taps are safe.
 *
 * ── Sound files needed (drop into mobile/assets/sounds/) ──────────────────
 *
 *  category_switch.mp3   50–150ms  soft swoosh / page turn
 *  start_story.mp3       600ms     triumphant ascending chime (Duolingo-style)
 *  companion_greet.mp3   400ms     gentle "boing" or bubble pop
 *  name_select.mp3       80ms      soft click / tap
 *  name_confirmed.mp3    900ms     short fanfare / celebration ding
 *  tab_focus.mp3         300ms     soft chime when returning to Play tab
 *
 * ── Free sources ──────────────────────────────────────────────────────────
 *  pixabay.com/sound-effects/  (no attribution required)
 *  freesound.org               (check CC0 licence)
 *  jsfxr.com                   (generate 8-bit SFX in browser, export MP3)
 *  zapsplat.com                (free with account)
 */

import { useEffect, useRef, useCallback } from 'react';
import { Audio, AVPlaybackSource } from 'expo-av';

// ── Sound catalogue ───────────────────────────────────────────────────────────
export type SoundName =
  | 'categorySwitch'   // swipe / arrow tap between categories
  | 'startStory'       // "Start Story" button pressed
  | 'companionGreet'   // greeting bubble appears
  | 'nameSelect'       // tap a name suggestion pill
  | 'nameConfirmed'    // "Let's go!" — companion named
  | 'tabFocus';        // Play tab re-focused after being away

// Map name → require(). Add the files to assets/sounds/ to activate.
const SOUND_SOURCES: Partial<Record<SoundName, AVPlaybackSource>> = {
  categorySwitch:  require('../../assets/sounds/category_switch.mp3'),
  startStory:      require('../../assets/sounds/start_story.mp3'),
  companionGreet:  require('../../assets/sounds/companion_greet.mp3'),
  nameSelect:      require('../../assets/sounds/name_select.mp3'),
  nameConfirmed:   require('../../assets/sounds/name_confirmed.mp3'),
  tabFocus:        require('../../assets/sounds/tab_focus.mp3'),
};

// Per-sound volume levels (0.0 – 1.0)
const VOLUMES: Record<SoundName, number> = {
  categorySwitch:  0.55,
  startStory:      0.80,
  companionGreet:  0.65,
  nameSelect:      0.45,
  nameConfirmed:   0.90,
  tabFocus:        0.50,
};

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useSoundEffects() {
  const soundsRef = useRef<Partial<Record<SoundName, Audio.Sound>>>({});
  const loadedRef = useRef(false);

  // Preload all sounds once
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Configure audio mode — don't interrupt narrator, respect silent switch
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,   // respect iOS silent switch
        staysActiveInBackground: false,
      }).catch(() => {});

      const entries = Object.entries(SOUND_SOURCES) as [SoundName, AVPlaybackSource][];

      await Promise.all(
        entries.map(async ([name, source]) => {
          try {
            const { sound } = await Audio.Sound.createAsync(source, {
              shouldPlay: false,
              volume: VOLUMES[name],
            });
            if (!cancelled) soundsRef.current[name] = sound;
          } catch {
            // Missing file or load error — silently skip this effect
          }
        })
      );

      if (!cancelled) loadedRef.current = true;
    };

    load();

    return () => {
      cancelled = true;
      // Unload all on unmount
      Object.values(soundsRef.current).forEach((s) => {
        s?.unloadAsync().catch(() => {});
      });
      soundsRef.current = {};
    };
  }, []);

  const play = useCallback((name: SoundName) => {
    const sound = soundsRef.current[name];
    if (!sound) return;

    // Rewind to start then play — safe to call rapidly
    sound.setPositionAsync(0)
      .then(() => sound.playAsync())
      .catch(() => {});
  }, []);

  return { play };
}
