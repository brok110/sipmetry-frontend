import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

type SoundName = 'cheers' | 'scanning';

const SOUND_FILES: Record<SoundName, any> = {
  cheers: require('@/assets/sounds/glass_clinking_2s-3s.mp3'),
  scanning: require('@/assets/sounds/martini_shake_pour_1s-10s.mp3'),
};

const SOUNDS_ENABLED_KEY = 'sipmetry:sounds_enabled';

class SoundServiceClass {
  private players: Partial<Record<SoundName, AudioPlayer>> = {};
  private enabled: boolean = true;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;

  async preload(): Promise<void> {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
    } catch (e) {
      console.warn('[SoundService] Failed to set audio mode:', e);
    }

    // Restore user preference
    try {
      const stored = await AsyncStorage.getItem(SOUNDS_ENABLED_KEY);
      if (stored === 'false') this.enabled = false;
    } catch {}

    for (const [name, file] of Object.entries(SOUND_FILES)) {
      try {
        const player = createAudioPlayer(file);
        this.players[name as SoundName] = player;
      } catch (e) {
        console.warn(`[SoundService] Failed to create player ${name}:`, e);
      }
    }
  }

  async play(name: SoundName): Promise<void> {
    if (!this.enabled) return;
    const player = this.players[name];
    if (!player) return;
    try {
      player.volume = 1.0;
      player.seekTo(0);
      player.play();
    } catch (e) {
      console.warn(`[SoundService] Failed to play ${name}:`, e);
    }
  }

  async playLoop(name: SoundName): Promise<void> {
    if (!this.enabled) return;
    const player = this.players[name];
    if (!player) return;
    try {
      player.volume = 0;
      player.loop = true;
      player.seekTo(0);
      player.play();

      // Fade in over 3 seconds (10 steps × 300ms)
      const steps = [0.05, 0.1, 0.18, 0.28, 0.4, 0.52, 0.65, 0.78, 0.9, 1.0];
      let stepIndex = 0;
      this.clearFadeTimer();
      const doStep = () => {
        if (stepIndex >= steps.length) return;
        try { player.volume = steps[stepIndex]; } catch {}
        stepIndex++;
        if (stepIndex < steps.length) {
          this.fadeTimer = setTimeout(doStep, 300);
        }
      };
      this.fadeTimer = setTimeout(doStep, 300);
    } catch (e) {
      console.warn(`[SoundService] Failed to loop ${name}:`, e);
    }
  }

  async stop(name: SoundName): Promise<void> {
    this.clearFadeTimer();
    const player = this.players[name];
    if (!player) return;
    try {
      player.pause();
      player.loop = false;
      player.seekTo(0);
    } catch (e) {
      console.warn(`[SoundService] Failed to stop ${name}:`, e);
    }
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  async setEnabled(value: boolean): Promise<void> {
    this.enabled = value;
    if (!value) {
      this.clearFadeTimer();
      for (const player of Object.values(this.players)) {
        try { player?.pause(); } catch {}
      }
    }
    try {
      await AsyncStorage.setItem(SOUNDS_ENABLED_KEY, String(value));
    } catch {}
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async unloadAll(): Promise<void> {
    this.clearFadeTimer();
    for (const player of Object.values(this.players)) {
      try { player?.release(); } catch {}
    }
    this.players = {};
  }
}

export const SoundService = new SoundServiceClass();
