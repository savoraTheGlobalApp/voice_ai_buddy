import { useEffect, useRef, useState, useCallback } from 'react';
import { Audio } from 'expo-av';

export interface NarratorState {
  isPlaying: boolean;
  isLoading: boolean;
  hasAudio: boolean;
  toggle: () => void;
  stop: () => void;
}

export function useNarrator(audioUrl: string | undefined): NarratorState {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Clean up the current sound object
  const unloadSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {
        // Ignore errors during cleanup
      }
      soundRef.current = null;
    }
    setIsPlaying(false);
    setIsLoading(false);
  }, []);

  // Load and auto-play when audioUrl changes
  useEffect(() => {
    if (!audioUrl) {
      unloadSound();
      return;
    }

    let cancelled = false;

    const load = async () => {
      await unloadSound();
      if (cancelled) return;

      try {
        setIsLoading(true);

        // Configure audio session for playback
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });

        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: true },
          (status) => {
            if (cancelled) return;
            if (status.isLoaded) {
              setIsPlaying(status.isPlaying);
              // Auto-stop state when playback finishes
              if (status.didJustFinish) {
                setIsPlaying(false);
              }
            }
          }
        );

        if (cancelled) {
          sound.unloadAsync();
          return;
        }

        soundRef.current = sound;
        setIsLoading(false);
      } catch (e) {
        if (!cancelled) {
          setIsLoading(false);
          setIsPlaying(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unloadSound();
    };
  }, []);

  const toggle = useCallback(async () => {
    const sound = soundRef.current;
    if (!sound) return;
    try {
      const status = await sound.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        await sound.pauseAsync();
      } else {
        // Replay from beginning if finished
        if (status.positionMillis >= (status.durationMillis ?? 0) - 200) {
          await sound.replayAsync();
        } else {
          await sound.playAsync();
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  const stop = useCallback(() => {
    unloadSound();
  }, [unloadSound]);

  return {
    isPlaying,
    isLoading,
    hasAudio: !!audioUrl,
    toggle,
    stop,
  };
}
