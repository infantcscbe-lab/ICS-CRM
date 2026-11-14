/**
 * Notification Sound Generator using the Web Audio API.
 * Synthesizes a clean, pleasant, high-clarity notification chime/beep.
 * - 100% offline, zero network requests, no 404s or broken media links.
 * - Works reliably across all browsers (Chrome, Edge, Firefox, Safari, Mobile).
 * - Automatically unlocks the audio context upon user interaction.
 */

const SOUND_PREF_KEY = 'ics_notification_sound_enabled';

class NotificationSoundService {
  private audioCtx: AudioContext | null = null;
  private isUnlocked: boolean = false;

  constructor() {
    this.setupUnlockListeners();
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  private setupUnlockListeners() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      const ctx = this.getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          this.isUnlocked = true;
        }).catch(() => {});
      } else {
        this.isUnlocked = true;
      }
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  public isEnabled(): boolean {
    if (typeof window === 'undefined') return true;
    const val = localStorage.getItem(SOUND_PREF_KEY);
    return val === null ? true : val === 'true';
  }

  public setEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SOUND_PREF_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent('ics-sound-pref-updated', { detail: { enabled } }));
  }

  /**
   * Plays a crisp, melodic notification beep / chime.
   * Pattern:
   * Tone 1: 587.33 Hz (D5) - 80ms
   * Tone 2: 880.00 Hz (A5) - 160ms
   */
  public async play(type: 'chime' | 'beep' | 'call_request' | 'urgent' = 'chime'): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const now = ctx.currentTime;

      if (type === 'call_request') {
        // High-clarity attention-grabbing double beep alert for incoming call requests
        const tones = [
          { freq: 880, delay: 0, dur: 0.12 },
          { freq: 1174.66, delay: 0.15, dur: 0.18 }, // D6 higher pitch confirmation
        ];

        tones.forEach(({ freq, delay, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const start = now + delay;

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);

          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.35, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(start);
          osc.stop(start + dur);
        });
        return;
      }

      if (type === 'beep') {
        // Classic crisp electronic beep (900 Hz)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(900, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.28, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.22);
        return;
      }

      if (type === 'urgent') {
        // Two urgent consecutive beeps
        for (let i = 0; i < 2; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const start = now + i * 0.12;

          osc.type = 'sine';
          osc.frequency.setValueAtTime(1046.5, start); // C6

          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.3, start + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(start);
          osc.stop(start + 0.09);
        }
        return;
      }

      // Default: Modern executive notification chime (dual-tone D5 -> A5)
      // Note 1: 587.33 Hz (D5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);

      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.25, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.12);

      // Note 2: 880.00 Hz (A5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.0, now + 0.08);

      gain2.gain.setValueAtTime(0, now + 0.08);
      gain2.gain.linearRampToValueAtTime(0.32, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc2.start(now + 0.08);
      osc2.stop(now + 0.35);
    } catch (err) {
      console.warn('[NotificationSound] Audio playback skipped:', err);
    }
  }
}

export const notificationSound = new NotificationSoundService();

export function playNotificationSound(type: 'chime' | 'beep' | 'call_request' | 'urgent' = 'chime') {
  notificationSound.play(type);
}

export function isNotificationSoundEnabled(): boolean {
  return notificationSound.isEnabled();
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  notificationSound.setEnabled(enabled);
}

