import type { CriterionKey, Sentence } from '../types';

export const CRITERIA: { key: CriterionKey; label: string; levels: [string, string, string] }[] = [
  {
    key: 'rhythm',
    label: 'Nhịp nói',
    levels: [
      '0 · Hụt nhịp, phải dừng hoặc bắt đầu lại',
      '1 · Có một đoạn chậm lại hoặc vội, nhưng nói hết câu',
      '2 · Giữ nhịp tương đối đều từ đầu đến cuối',
    ],
  },
  {
    key: 'phrase',
    label: 'Ngắt cụm',
    levels: [
      '0 · Ngắt ở giữa một cụm, làm câu khó theo dõi',
      '1 · Nhìn chung ngắt theo cụm, còn một chỗ chưa hợp lý',
      '2 · Ngắt đúng các ranh giới cụm chính trong bản mẫu',
    ],
  },
  {
    key: 'stress',
    label: 'Từ cần nhấn',
    levels: [
      '0 · Từ mục tiêu nghe chìm hoặc nhấn sang từ khác',
      '1 · Nhấn đúng từ nhưng độ nhấn còn mờ',
      '2 · Từ mục tiêu nổi bật trong câu',
    ],
  },
];

export type Scores = Partial<Record<CriterionKey, 0 | 1 | 2>>;

/** Returns the total out of 6, or null until all three criteria are chosen. */
export function totalScore(scores: Scores): number | null {
  const values = CRITERIA.map((c) => scores[c.key]);
  if (values.some((v) => v === undefined)) return null;
  return (values as number[]).reduce((sum, v) => sum + v, 0);
}

/** Learner-facing tip built from the sentence's own words. */
export function tipFor(key: CriterionKey, sentence: Sentence): string {
  if (key === 'stress' && sentence.stress) {
    return `Nghe lại từ ${sentence.stress}, rồi nói cả câu sao cho ${sentence.stress} nổi bật hơn.`;
  }
  const chunks = sentence.chunks ?? [];
  if (key === 'phrase' && chunks.length > 0) {
    return `Nghe lại chỗ ngắt sau "${chunks[0]}", rồi ngắt đúng ở ranh giới cụm đó.`;
  }
  if (key === 'rhythm' && chunks.length > 0) {
    return `Nghe lại cả câu và giữ nhịp đều, không dừng giữa "${chunks[chunks.length - 1]}".`;
  }
  return 'Nghe lại câu mẫu một lần, rồi nói theo đúng nhịp của bản mẫu.';
}

/**
 * Picks the criterion to coach on. Lowest score wins; on a tie the story's
 * focus criterion wins if it is among the tied lowest, otherwise the list order.
 */
export function pickCoachingCriterion(
  scores: Scores,
  focus: CriterionKey,
): CriterionKey | null {
  const values = CRITERIA.map((c) => ({ key: c.key, value: scores[c.key] as number }));
  const min = Math.min(...values.map((v) => v.value));
  if (min === 2) return null;
  const tied = values.filter((v) => v.value === min).map((v) => v.key);
  return tied.includes(focus) ? focus : tied[0];
}

export function coachingMessage(scores: Scores, focus: CriterionKey, sentence: Sentence): string {
  const key = pickCoachingCriterion(scores, focus);
  if (!key) return 'Cả ba tiêu chí đạt 2 điểm. Tiếp tục sang câu kế tiếp.';
  return tipFor(key, sentence);
}
