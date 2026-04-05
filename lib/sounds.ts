import { Audio } from 'expo-av';

type SoundName = 'cheers' | 'scanning';

const SOUND_FILES: Record<SoundName, any> = {
  cheers: require('@/assets/sounds/glass_clinking_2s-3s.mp3'),
  scanning: require('@/assets/sounds/martini_shake_pour_1s-10s.mp3'),
};

class SoundServiceClass {
  private sounds: Partial<Record<SoundName, Audio.Sound>> = {};
  private enabled: boolean = true;

  async preload(): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
    } catch (e) {
      console.warn('[SoundService] Failed to set audio mode:', e);
    }

    for (const [name, file] of Object.entries(SOUND_FILES)) {
      try {
        const { sound } = await Audio.Sound.createAsync(file);
        this.sounds[name as SoundName] = sound;
      } catch (e) {
        console.warn(`[SoundService] Failed to load ${name}:`, e);
      }
    }
  }

  async play(name: SoundName): Promise<void> {
    if (!this.enabled) return;
    const sound = this.sounds[name];
    if (!sound) return;
    try {
      await sound.setPositionAsync(0);
      await sound.playAsync();
    } catch (e) {
      console.warn(`[SoundService] Failed to play ${name}:`, e);
    }
  }

  async playLoop(name: SoundName): Promise<void> {
    if (!this.enabled) return;
    const sound = this.sounds[name];
    if (!sound) return;
    try {
      await sound.setIsLoopingAsync(true);
      await sound.setPositionAsync(0);
      await sound.setVolumeAsync(0);
      await sound.setRateAsync(0.7, true);
      await sound.playAsync();
      const steps = [0.05, 0.1, 0.18, 0.28, 0.4, 0.52, 0.65, 0.78, 0.9, 1.0];
      for (const vol of steps) {
        await new Promise(r => setTimeout(r, 300));
        await sound.setVolumeAsync(vol).catch(() => {});
      }
    } catch (e) {
      console.warn(`[SoundService] Failed to loop ${name}:`, e);
    }
  }

  async stop(name: SoundName): Promise<void> {
    const sound = this.sounds[name];
    if (!sound) return;
    try {
      await sound.stopAsync();
      await sound.setIsLoopingAsync(false);
    } catch (e) {
      console.warn(`[SoundService] Failed to stop ${name}:`, e);
    }
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) {
      for (const sound of Object.values(this.sounds)) {
        sound?.stopAsync().catch(() => {});
      }
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async unloadAll(): Promise<void> {
    for (const sound of Object.values(this.sounds)) {
      try {
        await sound?.unloadAsync();
      } catch {}
    }
    this.sounds = {};
  }
}

export const SoundService = new SoundServiceClass();
