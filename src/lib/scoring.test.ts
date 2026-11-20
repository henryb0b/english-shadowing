import { describe, expect, it } from 'vitest';
import { coachingMessage, pickCoachingCriterion, totalScore } from './scoring';
import { parseTranscript, validateAudioRows } from './lessonParser';
import type { Sentence } from '../types';

const firstLine: Sentence = {
  id: 'fixture',
  text: "You know we're presenting FIRST, right?",
  chunks: ['You know', "we're presenting FIRST,", 'right?'],
  stress: 'FIRST',
  scorable: true,
};

describe('scoring', () => {
  it('adds 2 + 2 + 1 to 5 out of 6', () => {
    expect(totalScore({ rhythm: 2, phrase: 2, stress: 1 })).toBe(5);
  });

  it('shows no total until all three criteria are chosen', () => {
    expect(totalScore({ rhythm: 2, phrase: 2 })).toBeNull();
    expect(totalScore({})).toBeNull();
  });

  it('coaches on the stress word for the 2 + 2 + 1 example', () => {
    const msg = coachingMessage({ rhythm: 2, phrase: 2, stress: 1 }, 'stress', firstLine);
    expect(msg).toBe('Nghe lại từ FIRST, rồi nói cả câu sao cho FIRST nổi bật hơn.');
  });

  it('prefers the story focus when the lowest scores are tied', () => {
    const tied = { rhythm: 0 as const, phrase: 0 as const, stress: 2 as const };
    expect(pickCoachingCriterion(tied, 'phrase')).toBe('phrase');
    expect(pickCoachingCriterion(tied, 'rhythm')).toBe('rhythm');
  });

  it('falls back to list order when the focus is not among the tied lowest', () => {
    const tied = { rhythm: 0 as const, phrase: 2 as const, stress: 0 as const };
    expect(pickCoachingCriterion(tied, 'phrase')).toBe('rhythm');
    expect(pickCoachingCriterion(tied, 'rhythm')).toBe('rhythm');
  });

  it('says to move on when all three criteria are 2', () => {
    expect(coachingMessage({ rhythm: 2, phrase: 2, stress: 2 }, 'rhythm', firstLine)).toMatch(
      /câu kế tiếp/,
    );
  });
});

describe('parseTranscript', () => {
  it('reads plain lines as listen-only sentences', () => {
    const { sentences, errors } = parseTranscript('Hello there.\n\nHow are you?');
    expect(errors).toEqual([]);
    expect(sentences.map((s) => s.text)).toEqual(['Hello there.', 'How are you?']);
    expect(sentences.every((s) => !s.scorable)).toBe(true);
  });

  it('makes a line scorable only when chunks and stress are valid', () => {
    const { sentences, errors } = parseTranscript(
      'I got it right now || I got it / right now || right',
    );
    expect(errors).toEqual([]);
    expect(sentences[0].scorable).toBe(true);
  });

  it('reports a stress word that is not in the sentence', () => {
    const { sentences, errors } = parseTranscript('I got it || I got it / now || tomorrow');
    expect(errors[0]).toMatch(/không có trong câu/);
    expect(sentences[0].scorable).toBe(false);
  });

  it('reports chunks that do not join back to the sentence', () => {
    const { errors } = parseTranscript('I got it now || I got / it || it');
    expect(errors[0]).toMatch(/không khớp/);
  });

  it('reports an empty transcript', () => {
    expect(parseTranscript('   \n  ').errors[0]).toMatch(/Chưa có câu/);
  });
});

describe('validateAudioRows', () => {
  it('flags timestamps outside the file duration on the right row', () => {
    const errors = validateAudioRows(
      [
        { text: 'One.', start: '0', end: '2' },
        { text: 'Two.', start: '2', end: '12' },
      ],
      10,
    );
    expect(errors[0]).toBeNull();
    expect(errors[1]).toMatch(/vượt thời lượng/);
  });

  it('flags start after end', () => {
    expect(validateAudioRows([{ text: 'A', start: '5', end: '3' }], 10)[0]).toMatch(/lớn hơn/);
  });
});

describe('parseYouTubeTranscript', () => {
  it('reads timestamp-then-text pairs and joins fragments into sentences', async () => {
    const { parseYouTubeTranscript } = await import('./lessonParser');
    const raw = [
      '0:01',
      'Hey, have you seen my',
      '0:03',
      'headphones anywhere?',
      '0:06 I looked under the couch.',
      '0:09 Hold on, are those on your neck?',
    ].join('\n');
    const { rows, errors } = parseYouTubeTranscript(raw);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { text: 'Hey, have you seen my headphones anywhere?', start: '1.00', end: '6.00' },
      { text: 'I looked under the couch.', start: '6.00', end: '9.00' },
      { text: 'Hold on, are those on your neck?', start: '9.00', end: '12.00' },
    ]);
  });

  it('splits long unpunctuated captions and warns', async () => {
    const { parseYouTubeTranscript } = await import('./lessonParser');
    const raw = ['0:00 one two three', '0:05 four five six', '0:20 seven eight'].join('\n');
    const { rows, errors } = parseYouTubeTranscript(raw);
    expect(rows.length).toBe(2);
    expect(errors[0]).toMatch(/không có dấu câu/);
  });

  it('reports text that has no timestamp', async () => {
    const { parseYouTubeTranscript } = await import('./lessonParser');
    expect(parseYouTubeTranscript('just text here').errors).toContainEqual(expect.stringMatching(/Không tìm thấy mốc/));
  });
});

describe('parseYouTubeTranscript with Vietnamese-locale copy', () => {
  it('reads "0:055 giây" style stamps and skips section titles', async () => {
    const { parseYouTubeTranscript } = await import('./lessonParser');
    const raw = [
      '0:000 giâyA few years ago, I was speaking with a business leader who was frustrated.',
      '0:055 giâyHe was always pitching new ideas.',
      'Phân cảnh 2: Dreamers vs. detectives',
      '1:041 phút, 4 giâyAfter years of interacting with business leaders.',
      '1:111 phút, 11 giâyThere are two types of people.',
    ].join('\n');
    const { rows, errors } = parseYouTubeTranscript(raw);
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.text)).toEqual([
      'A few years ago, I was speaking with a business leader who was frustrated.',
      'He was always pitching new ideas.',
      'After years of interacting with business leaders.',
      'There are two types of people.',
    ]);
    expect(rows[0].start).toBe('0.00');
    expect(rows[1].start).toBe('5.00');
    expect(rows[2].start).toBe('64.00');
  });
});

describe('parseYouTubeTranscript with English-locale copy', () => {
  it('reads "0:044 seconds" stamps, skips chapter titles and sound tags', async () => {
    const { parseYouTubeTranscript } = await import('./lessonParser');
    const raw = [
      'Chapter 1: The art of noticing',
      '0:044 secondsMy name is Kate. I am a designer.',
      '0:1111 secondsI am pretty much always watching how people navigate the designed world.',
      '0:2424 seconds[Use other door]',
      '0:2525 seconds(Laughter) For over 20 years, I have been taking photographs of signs.',
    ].join('\n');
    const { rows, errors } = parseYouTubeTranscript(raw);
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.text)).toEqual([
      'My name is Kate. I am a designer.',
      'I am pretty much always watching how people navigate the designed world.',
      'For over 20 years, I have been taking photographs of signs.',
    ]);
    expect(rows[1].start).toBe('11.00');
    expect(rows[2].start).toBe('25.00');
  });
});
