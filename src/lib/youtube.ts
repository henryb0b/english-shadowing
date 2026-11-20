/* Plays time ranges of an embedded YouTube video with the official IFrame API.
 * The video is never downloaded; YouTube's own player does the playback. */

const YT_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** YouTube only offers fixed speeds. Returns the closest supported one. */
export function nearestYouTubeRate(speed: number): number {
  return YT_RATES.reduce((best, r) => (Math.abs(r - speed) < Math.abs(best - speed) ? r : best), 1);
}

export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  const m = trimmed.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(trimmed) ? trimmed : null;
}

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  setPlaybackRate(rate: number): void;
  destroy(): void;
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

export function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise<void>((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => {
        apiPromise = null;
        reject(new Error('Không tải được YouTube player.'));
      };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

export class YouTubeSegmentPlayer {
  private player: YTPlayer | null = null;
  private ready: Promise<YTPlayer>;
  private timer = 0;
  private cancel: (() => void) | null = null;
  private destroyed = false;

  constructor(el: HTMLElement, videoId: string) {
    this.ready = loadYouTubeApi().then(
      () =>
        new Promise<YTPlayer>((resolve) => {
          if (this.destroyed) return;
          const player = new window.YT!.Player(el, {
            videoId,
            width: '100%',
            height: '100%',
            playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
            events: { onReady: () => resolve(player) },
          });
          this.player = player;
        }),
    );
  }

  /** Resolves true when the range finished, false when stopped. */
  async playSegment(start: number, end: number, speed: number): Promise<boolean> {
    const p = await this.ready;
    this.stop();
    return new Promise<boolean>((resolve) => {
      let reached = false;
      const finish = (completed: boolean) => {
        window.clearInterval(this.timer);
        p.pauseVideo();
        this.cancel = null;
        resolve(completed);
      };
      this.cancel = () => finish(false);
      p.setPlaybackRate(nearestYouTubeRate(speed));
      p.seekTo(start, true);
      p.playVideo();
      this.timer = window.setInterval(() => {
        const t = p.getCurrentTime();
        // Wait until the seek has landed before checking the end, so an old position is not mistaken for the end.
        if (!reached) {
          if (t >= start - 0.3 && t < end) reached = true;
          return;
        }
        if (t >= end) finish(true);
      }, 80);
    });
  }

  stop(): void {
    if (this.cancel) this.cancel();
    window.clearInterval(this.timer);
    this.player?.pauseVideo?.();
  }

  destroy(): void {
    this.destroyed = true;
    this.stop();
    this.player?.destroy();
    this.player = null;
  }
}
