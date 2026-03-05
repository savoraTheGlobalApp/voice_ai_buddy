import { useEffect, useRef, useState, useCallback } from 'react';
import { Audio } from 'expo-av';

export const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25] as const;
export type SpeedOption = typeof SPEED_OPTIONS[number];

export interface NarratorState {
  isPlaying: boolean;
  isLoading: boolean;
  isFinished: boolean;
  hasAudio: boolean;
  speed: SpeedOption;
  toggle: () => void;
  stop: () => void;
  cycleSpeed: () => void;
}

export function useNarrator(audioUrl: string | undefined): NarratorState {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [speed, setSpeed] = useState<SpeedOption>(0.75);

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
      setIsFinished(false);

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
              if (status.didJustFinish) {
                setIsPlaying(false);
                setIsFinished(true);
              }
            }
          }
        );

        if (cancelled) {
          sound.unloadAsync();
          return;
        }

        soundRef.current = sound;
        // Apply current speed — shouldCorrectPitch=true keeps natural pitch
        await sound.setRateAsync(speed, true).catch(() => {});
        setIsLoading(false);
      } catch (e) {
        console.error('[useNarrator] Failed to load audio:', audioUrl, e);
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
          setIsFinished(false);
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

  const cycleSpeed = useCallback(async () => {
    const currentIndex = SPEED_OPTIONS.indexOf(speed);
    const nextSpeed = SPEED_OPTIONS[(currentIndex + 1) % SPEED_OPTIONS.length];
    setSpeed(nextSpeed);
    if (soundRef.current) {
      await soundRef.current.setRateAsync(nextSpeed, true).catch(() => {});
    }
  }, [speed]);

  return {
    isPlaying,
    isLoading,
    isFinished,
    hasAudio: !!audioUrl,
    speed,
    toggle,
    stop,
    cycleSpeed,
  };
}
