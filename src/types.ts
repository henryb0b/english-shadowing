export type Difficulty = 'Cơ bản' | 'Trung bình' | 'Nâng cao';
export type IeltsPart = 1 | 2 | 3;
export type CriterionKey = 'rhythm' | 'phrase' | 'stress';
export type Speed = 0.75 | 0.9 | 1;

export interface Sentence {
  id: string;
  text: string;
  /** Phrase chunks that join back to `text` (used for hints and phrase scoring). */
  chunks?: string[];
  /** The one word the learner should stress in this sentence. */
  stress?: string;
  /** Only sentences with chunks + stress can be self-scored. */
  scorable: boolean;
  /** Teacher audio segment, in seconds. */
  start?: number;
  end?: number;
}

export interface Story {
  id: string;
  title: string;
  difficulty: Difficulty;
  part: IeltsPart;
  phrase: { en: string; vi: string };
  focus: CriterionKey;
  focusNote: string;
  ieltsQuestion: string;
  sentences: Sentence[];
  source: 'builtin' | 'teacher';
  /** Public URL of uploaded media in shared storage (shared teacher lessons only). */
  audioUrl?: string;
  /** Key of an audio blob in IndexedDB (teacher audio lessons only). */
  audioId?: string;
  audioPersistent?: boolean;
  /** YouTube video ID (teacher lessons only). Sentences then use start/end on this video. */
  youtubeId?: string;
  createdAt?: string;
}

export interface ScoreAttempt {
  storyId: string;
  sentenceId: string;
  speed: Speed;
  rhythm: 0 | 1 | 2;
  phrase: 0 | 1 | 2;
  stress: 0 | 1 | 2;
  total: number;
  at: string;
}

export interface StoryProgress {
  listened: boolean;
  ieltsDone: boolean;
  practicedSentences: string[];
}

export interface ProgressData {
  attempts: ScoreAttempt[];
  stories: Record<string, StoryProgress>;
}
