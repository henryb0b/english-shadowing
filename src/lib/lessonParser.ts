import type { Sentence } from '../types';

export interface ParseResult {
  sentences: Sentence[];
  errors: string[];
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');

/**
 * Parses teacher transcript lines.
 * Format per line:  Sentence text
 *   or:             Sentence text || chunk one / chunk two / chunk three || STRESSWORD
 * The chunks must join back to the sentence and the stress word must appear in it;
 * otherwise the line is still kept, but it is not self-scorable and an error is returned.
 */
export function parseTranscript(raw: string): ParseResult {
  const sentences: Sentence[] = [];
  const errors: string[] = [];
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

  lines.forEach((line, index) => {
    const label = `Dòng ${index + 1}`;
    const parts = line.split('||').map((p) => p.trim());
    const text = parts[0];
    if (!text) {
      errors.push(`${label}: câu trống.`);
      return;
    }
    const id = `t${index + 1}`;
    if (parts.length === 1) {
      sentences.push({ id, text, scorable: false });
      return;
    }

    const chunks = (parts[1] ?? '').split('/').map((c) => c.trim()).filter(Boolean);
    const stress = (parts[2] ?? '').trim();
    if (!stress) {
      errors.push(`${label}: thiếu từ cần nhấn, nên câu này chỉ dùng để nghe.`);
      sentences.push({ id, text, scorable: false });
      return;
    }
    if (!new RegExp(`\\b${stress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      errors.push(`${label}: từ "${stress}" không có trong câu.`);
      sentences.push({ id, text, chunks, stress, scorable: false });
      return;
    }
    if (chunks.length < 2) {
      errors.push(`${label}: cần ít nhất 2 cụm để tự chấm ngắt cụm.`);
      sentences.push({ id, text, chunks, stress, scorable: false });
      return;
    }
    if (normalize(chunks.join(' ')) !== normalize(text)) {
      errors.push(`${label}: các cụm ghép lại không khớp với câu.`);
      sentences.push({ id, text, chunks, stress, scorable: false });
      return;
    }
    sentences.push({ id, text, chunks, stress, scorable: true });
  });

  if (sentences.length === 0 && errors.length === 0) {
    errors.push('Chưa có câu nào. Mỗi dòng là một câu tiếng Anh.');
  }
  return { sentences, errors };
}

export interface TimedRow {
  text: string;
  start: string;
  end: string;
}

const MAX_SENTENCE_SECONDS = 12;

function toSeconds(stamp: string): number {
  return stamp
    .split(':')
    .reduce((total, part) => total * 60 + Number(part), 0);
}

/**
 * Turns a transcript copied from YouTube's "Show transcript" panel into sentences with timings.
 * Accepts "0:05 Hello there" on one line, or "0:05" with the text on the next line.
 * Caption fragments are joined until they end with . ? ! (or run past 12 seconds).
 */
export function parseYouTubeTranscript(raw: string): { rows: TimedRow[]; errors: string[] } {
  const errors: string[] = [];
  const segments: { start: number; text: string }[] = [];
  let pending: number | null = null;
  let orphan = false;

  for (const line of raw.split('\n').map((l) => l.trim()).filter(Boolean)) {
    // Section titles such as "Phân cảnh 2: …" are not caption text.
    if (/^Phân cảnh\b/i.test(line)) continue;
    // Timestamp, then an optional duration label that YouTube adds in some locales:
    // "0:055 giây" = 0:05 + "5 giây", "1:041 phút, 4 giây" = 1:04 + "1 phút, 4 giây".
    const m = line.match(
      /^((?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?)(?:\d+ phút(?:, \d+ giây)?|\d+ giây)?\s*(.*)$/,
    );
    if (m) {
      const start = toSeconds(m[1]);
      if (m[2]) segments.push({ start, text: m[2] });
      else pending = start;
      continue;
    }
    if (pending !== null) {
      segments.push({ start: pending, text: line });
      pending = null;
    } else if (segments.length > 0) {
      segments[segments.length - 1].text += ` ${line}`;
    } else {
      orphan = true;
    }
  }
  if (orphan) errors.push('Có dòng chữ đứng trước mốc thời gian đầu tiên nên đã bị bỏ qua.');
  if (segments.length === 0) {
    return { rows: [], errors: [...errors, 'Không tìm thấy mốc thời gian. Hãy copy transcript có dạng "0:05 câu nói".'] };
  }

  const rows: TimedRow[] = [];
  let forced = 0;
  let buf: { text: string; start: number; end: number } | null = null;
  const flush = () => {
    if (buf) rows.push({ text: buf.text, start: buf.start.toFixed(2), end: buf.end.toFixed(2) });
    buf = null;
  };

  segments.forEach((seg, i) => {
    const end = segments[i + 1]?.start ?? seg.start + 3;
    if (!buf) buf = { text: '', start: seg.start, end };
    buf.text = `${buf.text} ${seg.text}`.trim();
    buf.end = end;
    const endsSentence = /[.?!]["')\]]*$/.test(seg.text.trim());
    if (endsSentence) {
      flush();
    } else if (buf.end - buf.start > MAX_SENTENCE_SECONDS) {
      forced += 1;
      flush();
    }
  });
  flush();

  if (forced > 0) {
    errors.push(`${forced} đoạn không có dấu câu nên được tách theo thời gian. Hãy kiểm tra lại từng câu.`);
  }
  return { rows, errors };
}

export interface AudioRowInput {
  text: string;
  start: string;
  end: string;
}

/** Validates teacher timestamps against the real audio duration. Index-aligned with rows. */
export function validateAudioRows(rows: AudioRowInput[], duration: number): (string | null)[] {
  return rows.map((row) => {
    if (!row.text.trim()) return 'Câu này đang trống.';
    const start = Number(row.start);
    const end = Number(row.end);
    if (row.start.trim() === '' || Number.isNaN(start)) return 'Nhập mốc bắt đầu bằng số giây.';
    if (row.end.trim() === '' || Number.isNaN(end)) return 'Nhập mốc kết thúc bằng số giây.';
    if (start < 0) return 'Mốc bắt đầu phải từ 0 trở lên.';
    if (end <= start) return 'Mốc kết thúc phải lớn hơn mốc bắt đầu.';
    if (duration > 0 && end > duration) {
      return `Mốc kết thúc vượt thời lượng file (${duration.toFixed(1)} giây).`;
    }
    if (duration > 0 && start >= duration) return 'Mốc bắt đầu nằm ngoài thời lượng file.';
    return null;
  });
}
