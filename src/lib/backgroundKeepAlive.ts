/**
 * Background Keep-Alive Engine for Mobile Browsers
 *
 * Keeps JavaScript execution, background geolocation, and network sync active when:
 * - Phone screen is turned OFF (locked / in pocket)
 * - User switches to another app (e.g. Google Maps navigation, phone call, WhatsApp)
 * - Browser tab is minimized or in background
 *
 * Techniques used:
 * 1. Silent Audio Loop (HTML5 Audio + Web Audio Context):
 *    Android & iOS treat the tab as an active background media playback session.
 * 2. MediaSession API:
 *    Registers a persistent lock screen & notification bar media player, preventing OS Doze Mode.
 * 3. Web Worker 10s Heartbeat:
 *    Emits periodic 10-second ticks unaffected by background DOM timers.
 */

// Minimal valid silent 1-second 8kHz mono WAV base64 string
const SILENT_WAV_BASE64 =
  'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhEgAAAAEAAP//AAABAP//AAABAA==';

class BackgroundKeepAliveEngine {
  private audioElement: HTMLAudioElement | null = null;
  private audioCtx: (AudioContext | (typeof window & { webkitAudioContext?: typeof AudioContext })['webkitAudioContext']) | null = null;
  private oscNode: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private worker: Worker | null = null;
  private isRunning = false;
  private heartbeatCallbacks = new Set<() => void>();

  /**
   * Prime audio on direct user gesture (e.g. tapping "Punch In" button).
   * Ensures browser does not block audio autoplay when phone goes into background.
   */
  public prime(): void {
    try {
      if (!this.audioElement) {
        this.audioElement = new Audio(SILENT_WAV_BASE64);
        this.audioElement.loop = true;
        this.audioElement.volume = 0.001; // virtually silent
        this.audioElement.preload = 'auto';
      }
      this.audioElement.play().catch(() => {});

      // Also unlock Web Audio Context
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass && !this.audioCtx) {
        this.audioCtx = new AudioContextClass();
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
      }
    } catch {}
  }

  /**
   * Start background keepalive
   * @param tripTitle Title to show on mobile lock screen notification
   */
  public async start(tripTitle = 'ICS On-Duty Live GPS Tracking'): Promise<boolean> {
    if (this.isRunning) return true;
    this.isRunning = true;

    // 1. Initialize and start silent audio element
    try {
      if (!this.audioElement) {
        this.audioElement = new Audio(SILENT_WAV_BASE64);
        this.audioElement.loop = true;
        this.audioElement.volume = 0.001;
        this.audioElement.preload = 'auto';
      }

      await this.audioElement.play().catch((err) => {
        console.warn('Silent audio keepalive autoplay note:', err);
      });

      // 2. Web Audio Context continuous silent oscillator
      try {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass && !this.audioCtx) {
          this.audioCtx = new AudioContextClass();
        }
        if (this.audioCtx) {
          if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume().catch(() => {});
          }
          if (!this.oscNode) {
            this.oscNode = this.audioCtx.createOscillator();
            this.gainNode = this.audioCtx.createGain();
            this.gainNode.gain.setValueAtTime(0.0001, this.audioCtx.currentTime); // Inaudible
            this.oscNode.connect(this.gainNode);
            this.gainNode.connect(this.audioCtx.destination);
            this.oscNode.start();
          }
        }
      } catch (err) {
        console.warn('Web Audio context note:', err);
      }

      // 3. Set MediaSession lock screen metadata
      if ('mediaSession' in navigator && navigator.mediaSession) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: tripTitle,
          artist: 'ICS Live Duty Tracking (Active)',
          album: 'Background GPS Active (Screen-Off Protected)',
          artwork: [
            { src: '/ics-logo.png', sizes: '192x192', type: 'image/png' },
          ],
        });

        navigator.mediaSession.playbackState = 'playing';

        // Keep session responsive to headphone / lock screen controls
        navigator.mediaSession.setActionHandler('play', () => {
          this.audioElement?.play().catch(() => {});
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          // Keep playing to ensure GPS tracking doesn't drop
          this.audioElement?.play().catch(() => {});
        });
      }
    } catch (err) {
      console.warn('Audio background keepalive failed to start:', err);
    }

    // 4. Start Web Worker 10s Heartbeat (Unthrottled background timer)
    try {
      if (!this.worker && typeof Worker !== 'undefined') {
        const workerBlob = new Blob(
          [
            `
            let timer = null;
            self.onmessage = function(e) {
              if (e.data === 'start') {
                if (timer) clearInterval(timer);
                // Exact 10 second interval for on-duty live updates
                timer = setInterval(function() {
                  self.postMessage('tick');
                }, 10000);
              } else if (e.data === 'stop') {
                if (timer) clearInterval(timer);
                timer = null;
              }
            };
          `,
          ],
          { type: 'application/javascript' }
        );

        this.worker = new Worker(URL.createObjectURL(workerBlob));
        this.worker.onmessage = (e) => {
          if (e.data === 'tick') {
            this.heartbeatCallbacks.forEach((cb) => {
              try {
                cb();
              } catch (err) {
                console.error('Heartbeat callback error:', err);
              }
            });
          }
        };
        this.worker.postMessage('start');
      }
    } catch (err) {
      console.warn('Worker keepalive fallback note:', err);
    }

    return true;
  }

  /**
   * Stop background keepalive completely (e.g. on Punch Out)
   */
  public stop(): void {
    this.isRunning = false;

    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      } catch {}
    }

    if (this.oscNode) {
      try {
        this.oscNode.stop();
        this.oscNode.disconnect();
      } catch {}
      this.oscNode = null;
    }

    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {}
      this.gainNode = null;
    }

    if (this.audioCtx) {
      try {
        this.audioCtx.close().catch(() => {});
      } catch {}
      this.audioCtx = null;
    }

    if ('mediaSession' in navigator && navigator.mediaSession) {
      navigator.mediaSession.playbackState = 'none';
    }

    if (this.worker) {
      try {
        this.worker.postMessage('stop');
        this.worker.terminate();
      } catch {}
      this.worker = null;
    }

    this.heartbeatCallbacks.clear();
  }

  /**
   * Register a callback to fire on every background heartbeat tick (every 10s)
   */
  public onHeartbeat(callback: () => void): () => void {
    this.heartbeatCallbacks.add(callback);
    return () => {
      this.heartbeatCallbacks.delete(callback);
    };
  }

  /**
   * Check if background keepalive is currently active
   */
  public get active(): boolean {
    return this.isRunning;
  }
}

export const backgroundKeepAlive = new BackgroundKeepAliveEngine();

