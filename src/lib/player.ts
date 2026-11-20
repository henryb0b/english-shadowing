import type { Sentence, Speed } from '../types';
import type { YouTubeSegmentPlayer } from './youtube';

/** en-US voices only. The browser decides which voices exist on this device. */
export function getEnUSVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.replace('_', '-').toLowerCase() === 'en-us');
}

/** Waits briefly for the voice list, because many browsers load it asynchronously. */
export function waitForVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve([]);
      return;
    }
    const synth = window.speechSynthesis;
    if (synth.getVoices().length > 0) {
      resolve(getEnUSVoices());
      return;
    }
    const done = () => {
      synth.removeEventListener('voiceschanged', done);
      resolve(getEnUSVoices());
    };
    synth.addEventListener('voiceschanged', done);
    window.setTimeout(done, timeoutMs);
  });
}

/**
 * Plays one sentence at a time. Every stop() cancels speech, pauses audio and
 * resolves any waiting promise with false, so no queued loop can continue.
 */
export class LessonPlayer {
  private resolver: ((completed: boolean) => void) | null = null;
  private audio: HTMLAudioElement | null = null;
  private audioUrl = '';
  private rafId = 0;
  private youtube: YouTubeSegmentPlayer | null = null;

  setAudioSource(url: string | null): void {
    if (url === this.audioUrl) return;
    this.stop();
    this.audioUrl = url ?? '';
    this.audio = url ? new Audio(url) : null;
  }

  setYouTube(player: YouTubeSegmentPlayer | null): void {
    this.stop();
    this.youtube = player;
  }

  hasAudio(): boolean {
    return this.audio !== null;
  }

  stop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.audio) this.audio.pause();
    this.youtube?.stop();
    const resolve = this.resolver;
    this.resolver = null;
    resolve?.(false);
  }

  /** Resolves true when the sentence finished, false when it was stopped or failed. */
  playSentence(sentence: Sentence, speed: Speed, voice: SpeechSynthesisVoice | null): Promise<boolean> {
    this.stop();
    if (sentence.start !== undefined && sentence.end !== undefined && this.youtube) {
      return this.youtube.playSegment(sentence.start, sentence.end, speed);
    }
    if (sentence.start !== undefined && sentence.end !== undefined && this.audio) {
      return this.playSegment(sentence.start, sentence.end, speed);
    }
    if (!voice) return Promise.resolve(false);
    return this.speak(sentence.text, speed, voice);
  }

  private speak(text: string, speed: Speed, voice: SpeechSynthesisVoice): Promise<boolean> {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.voice = voice;
      utterance.rate = speed;
      utterance.onend = () => {
        if (this.resolver === resolve) this.resolver = null;
        resolve(true);
      };
      utterance.onerror = () => {
        if (this.resolver === resolve) this.resolver = null;
        resolve(false);
      };
      this.resolver = resolve;
      window.speechSynthesis.speak(utterance);
    });
  }

  private playSegment(start: number, end: number, speed: Speed): Promise<boolean> {
    return new Promise((resolve) => {
      const audio = this.audio;
      if (!audio) {
        resolve(false);
        return;
      }
      audio.playbackRate = speed;
      audio.currentTime = start;
      this.resolver = resolve;
      const tick = () => {
        if (audio.currentTime >= end || audio.ended) {
          audio.pause();
          this.rafId = 0;
          if (this.resolver === resolve) this.resolver = null;
          resolve(true);
          return;
        }
        this.rafId = requestAnimationFrame(tick);
      };
      audio.play().then(() => tick()).catch(() => {
        if (this.resolver === resolve) this.resolver = null;
        resolve(false);
      });
    });
  }
}
