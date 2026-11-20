import type { IeltsPart } from '../types';

export function partLabel(part: IeltsPart): string {
  if (part === 2) return 'Part 2 · Đoạn trích luyện kể';
  return part === 1 ? 'Part 1' : 'Part 3';
}

export const SPEED_LABEL: Record<number, string> = {
  0.75: '0.75×',
  0.9: '0.9×',
  1: '1.0×',
};

export const FOCUS_LABEL = {
  rhythm: 'Nhịp nói',
  phrase: 'Ngắt cụm',
  stress: 'Từ cần nhấn',
} as const;
