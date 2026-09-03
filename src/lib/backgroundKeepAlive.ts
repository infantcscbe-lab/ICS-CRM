/**
 * Background Keep-Alive Engine for Mobile Browsers
 *
 * Keeps JavaScript execution and GPS tracking active when:
 * - Phone screen is turned OFF (locked / in pocket)
 * - User switches to another app (e.g. Google Maps navigation, phone call, WhatsApp)
 * - Browser tab is minimized or in background
 *
 * Techniques used:
 * 1. Inaudible Silent Audio Loop: Android & iOS treat the tab as an active background media playback session.
 * 2. MediaSession API: Puts a live notification on the mobile lock screen.
 * 3. Web Worker Heartbeat: Emits periodic ticks unaffected by background DOM throttling.
 */

// Minimal valid silent 1-second 8kHz mono WAV base64 string
const SILENT_WAV_BASE64 =
  'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhEgAAAAEAAP//AAABAP//AAABAA==';

class BackgroundKeepAliveEngine {
  private audioElement: HTMLAudioElement | null = null;
  private worker: Worker | null = null;
  private isRunning = false;
  private heartbeatCallbacks = new Set<() => void>();

  /**
   * Start background keepalive
   * @param tripTitle Optional title to show on mobile lock screen
   */
  public async start(tripTitle = 'ICS Live GPS Tracking'): Promise<boolean> {
    if (this.isRunning) return true;
    this.isRunning = true;

    // 1. Initialize and start silent audio loop
    try {
      if (!this.audioElement) {
        this.audioElement = new Audio(SILENT_WAV_BASE64);
        this.audioElement.loop = true;
        this.audioElement.volume = 0.01; // virtually silent
        this.audioElement.preload = 'auto';
      }

      await this.audioElement.play().catch((err) => {
        console.warn('Silent audio keepalive autoplay note:', err);
      });

      // 2. Set MediaSession lock screen metadata
      if ('mediaSession' in navigator && navigator.mediaSession) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: tripTitle,
          artist: 'Active Trip Tracking',
          album: 'Runs in background with screen off',
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

    // 3. Start Web Worker Heartbeat
    try {
      if (!this.worker && typeof Worker !== 'undefined') {
        const workerBlob = new Blob(
          [
            `
            let timer = null;
            self.onmessage = function(e) {
              if (e.data === 'start') {
                if (timer) clearInterval(timer);
                timer = setInterval(function() {
                  self.postMessage('tick');
                }, 5000);
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
   * Stop background keepalive
   */
  public stop(): void {
    this.isRunning = false;

    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      } catch {}
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
  }

  /**
   * Register a callback to fire on every background heartbeat tick (every ~5s)
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
