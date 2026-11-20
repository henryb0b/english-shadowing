import { useEffect, useMemo, useRef, useState } from 'react';
import type { CriterionKey, Difficulty, IeltsPart, Sentence, Story } from '../types';
import { LessonPlayer } from '../lib/player';
import { parseTranscript, parseYouTubeTranscript, validateAudioRows, type AudioRowInput } from '../lib/lessonParser';
import { parseYouTubeId } from '../lib/youtube';
import { signIn, signOut } from '../lib/cloud';
import { FOCUS_LABEL } from './labels';

interface Props {
  voice: SpeechSynthesisVoice | null;
  onSave: (story: Story, file: File | null) => Promise<string[]>;
  onDone: () => void;
  cloudEnabled: boolean;
  isTeacher: boolean;
}

type Mode = 'transcript' | 'audio' | 'youtube';
interface Row extends AudioRowInput {
  chunks: string;
  stress: string;
}

const TRANSCRIPT_EXAMPLE = `I ordered an iced latte, but they gave me a hot chocolate. || I ordered an iced latte / but they gave me / a hot chocolate. || chocolate
It was way too sweet. || It was way too sweet. || sweet
Next time, I'm going to speak up.`;

const LARGE_FILE_BYTES = 150 * 1024 * 1024;

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const emptyRow = (): Row => ({ text: '', start: '', end: '', chunks: '', stress: '' });

/** Builds a sentence from one timed row, reusing the transcript parser so the rules match. */
function rowToSentence(row: Row, index: number): { sentence: Sentence | null; warning: string | null } {
  const line = row.chunks.trim() || row.stress.trim() ? `${row.text.trim()} || ${row.chunks} || ${row.stress}` : row.text.trim();
  const { sentences, errors } = parseTranscript(line);
  const base = sentences[0];
  if (!base) return { sentence: null, warning: null };
  return {
    sentence: { ...base, id: `a${index + 1}`, start: Number(row.start), end: Number(row.end) },
    warning: errors[0] ?? null,
  };
}

export default function CreateLesson({ voice, onSave, onDone, cloudEnabled, isTeacher }: Props) {
  const locked = cloudEnabled && !isTeacher;
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('Cơ bản');
  const [part, setPart] = useState<IeltsPart>(1);
  const [focus, setFocus] = useState<CriterionKey>('rhythm');
  const [focusNote, setFocusNote] = useState('');
  const [phraseEn, setPhraseEn] = useState('');
  const [phraseVi, setPhraseVi] = useState('');
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<Mode>('transcript');
  const [transcript, setTranscript] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [ytRaw, setYtRaw] = useState('');
  const [confirmSource, setConfirmSource] = useState(false);
  const [player] = useState(() => new LessonPlayer());
  const urlRef = useRef<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'warn' | 'ok'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => parseTranscript(transcript), [transcript]);
  const youtubeId = useMemo(() => (youtubeUrl.trim() ? parseYouTubeId(youtubeUrl) : null), [youtubeUrl]);

  const rowResults = useMemo(() => rows.map((r, i) => rowToSentence(r, i)), [rows]);
  const timeErrors = useMemo(() => validateAudioRows(rows, mode === 'audio' ? duration : 0), [rows, duration, mode]);

  useEffect(() => {
    return () => {
      player.stop();
      player.setAudioSource(null);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [player]);

  const onFileChange = (f: File | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    setFile(f);
    setDuration(0);
    setConfirmSource(false);
    if (!f) {
      urlRef.current = null;
      setAudioUrl(null);
      player.setAudioSource(null);
      return;
    }
    const url = URL.createObjectURL(f);
    urlRef.current = url;
    setAudioUrl(url);
    player.setAudioSource(url);
    const probe = new Audio();
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => setDuration(Number.isFinite(probe.duration) ? probe.duration : 0);
    probe.onerror = () => setMessage({ kind: 'error', text: 'Không đọc được file này. Hãy thử file MP3, M4A, WAV hoặc MP4 khác.' });
    probe.src = url;
  };

  const fillFromYouTubeTranscript = () => {
    const { rows: timed, errors } = parseYouTubeTranscript(ytRaw);
    if (timed.length === 0) {
      setMessage({ kind: 'error', text: errors[0] ?? 'Không tạo được danh sách câu.' });
      return;
    }
    setRows(timed.map((r) => ({ ...emptyRow(), ...r })));
    setMessage(
      errors.length > 0
        ? { kind: 'warn', text: `Đã tạo ${timed.length} câu. Lưu ý: ${errors.join(' ')}` }
        : { kind: 'ok', text: `Đã tạo ${timed.length} câu từ transcript. Hãy thêm cụm ngắt và từ cần nhấn cho các câu muốn tự chấm.` },
    );
  };

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const previewTranscript = async () => {
    const first = parsed.sentences[0];
    if (!first) return;
    if (!voice) {
      setMessage({ kind: 'warn', text: 'Thiết bị này chưa có giọng en-US để nghe thử. Hãy cài giọng English (United States).' });
      return;
    }
    player.setAudioSource(null);
    await player.playSentence(first, 0.9, voice);
  };

  const previewRow = async (i: number) => {
    const sentence = rowResults[i].sentence;
    if (!sentence || !audioUrl || timeErrors[i]) return;
    player.setAudioSource(audioUrl);
    await player.playSentence(sentence, 0.9, voice);
  };

  const save = async () => {
    setMessage(null);
    if (locked) return setMessage({ kind: 'error', text: 'Hãy đăng nhập giáo viên để thêm bài chung.' });
    if (!title.trim()) return setMessage({ kind: 'error', text: 'Hãy nhập tiêu đề bài.' });

    let sentences: Sentence[] = [];
    const warnings: string[] = [];

    if (mode === 'transcript') {
      if (parsed.sentences.length === 0) return setMessage({ kind: 'error', text: parsed.errors[0] ?? 'Hãy dán transcript.' });
      sentences = parsed.sentences;
      warnings.push(...parsed.errors);
    } else {
      if (mode === 'audio') {
        if (!file) return setMessage({ kind: 'error', text: 'Hãy chọn file audio hoặc video.' });
        if (duration <= 0) return setMessage({ kind: 'error', text: 'Đang đọc thời lượng file. Hãy thử lại sau vài giây.' });
      } else {
        if (!youtubeId) return setMessage({ kind: 'error', text: 'Link YouTube không hợp lệ. Hãy dán link dạng youtube.com/watch?v=… hoặc youtu.be/….' });
      }
      if (!confirmSource) {
        return setMessage({
          kind: 'error',
          text:
            mode === 'audio'
              ? 'Hãy xác nhận file này dùng giọng Anh–Mỹ (en-US) trước khi lưu.'
              : 'Hãy xác nhận bạn có quyền dùng clip này cho lớp học và clip có giọng Anh–Mỹ.',
        });
      }
      if (rows.length === 0) return setMessage({ kind: 'error', text: 'Hãy thêm ít nhất một câu có mốc thời gian.' });
      const bad = timeErrors.findIndex((e) => e !== null);
      if (bad !== -1) return setMessage({ kind: 'error', text: `Câu ${bad + 1}: ${timeErrors[bad]}` });
      sentences = rowResults.map((r) => r.sentence).filter((s): s is Sentence => s !== null);
      rowResults.forEach((r, i) => r.warning && warnings.push(`Câu ${i + 1}: ${r.warning}`));
    }

    setSaving(true);
    const id = `lesson-${Date.now()}`;
    const story: Story = {
      id,
      title: title.trim(),
      difficulty,
      part,
      phrase: { en: phraseEn.trim(), vi: phraseVi.trim() },
      focus,
      focusNote: focusNote.trim() || 'Chú ý trọng tâm đã chọn khi nghe bản mẫu.',
      ieltsQuestion: question.trim(),
      sentences,
      source: 'teacher',
      createdAt: new Date().toISOString(),
    };

    if (mode === 'youtube' && youtubeId) {
      story.youtubeId = youtubeId;
    }

    let storeWarnings: string[] = [];
    try {
      storeWarnings = await onSave(story, mode === 'audio' ? file : null);
    } catch (err) {
      setSaving(false);
      return setMessage({ kind: 'error', text: (err as Error).message });
    }
    setSaving(false);
    warnings.unshift(...storeWarnings);
    if (warnings.length > 0) {
      setMessage({ kind: 'warn', text: `Đã lưu bài. Lưu ý: ${warnings.join(' ')}` });
      return;
    }
    onDone();
  };

  const scorableCount = (mode === 'transcript' ? parsed.sentences : rowResults.map((r) => r.sentence).filter(Boolean)).filter(
    (s) => s!.scorable,
  ).length;

  if (locked) {
    return (
      <section aria-labelledby="create-title" className="create">
        <div className="section-head">
          <h2 id="create-title">Tạo bài luyện</h2>
          <p className="muted">Phần này dành cho giáo viên. Học sinh vẫn xem và luyện bài bình thường.</p>
        </div>
        <TeacherLogin signedIn={false} />
      </section>
    );
  }

  return (
    <section aria-labelledby="create-title" className="create">
      <div className="section-head">
        <h2 id="create-title">Tạo bài luyện</h2>
        <p className="muted">
          {cloudEnabled
            ? 'Bài bạn lưu sẽ hiển thị cho mọi học sinh. Chỉ các câu có đủ cụm ngắt và từ cần nhấn mới được bật tự chấm.'
            : 'Bài của bạn được lưu trên thiết bị này. Chỉ các câu có đủ cụm ngắt và từ cần nhấn mới được bật tự chấm.'}
        </p>
      </div>
      {cloudEnabled && <TeacherLogin signedIn={isTeacher} />}

      <div className="card form">
        <label className="field">
          <span>Tiêu đề bài</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Lost Keys at the Gym" />
        </label>

        <div className="grid-2">
          <label className="field">
            <span>Độ khó</span>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              <option>Cơ bản</option>
              <option>Trung bình</option>
              <option>Nâng cao</option>
            </select>
          </label>
          <label className="field">
            <span>IELTS Part</span>
            <select value={part} onChange={(e) => setPart(Number(e.target.value) as IeltsPart)}>
              <option value={1}>Part 1</option>
              <option value={2}>Part 2 · Đoạn trích luyện kể</option>
              <option value={3}>Part 3</option>
            </select>
          </label>
        </div>

        <div className="grid-2">
          <label className="field">
            <span>Trọng tâm shadowing</span>
            <select value={focus} onChange={(e) => setFocus(e.target.value as CriterionKey)}>
              {(Object.keys(FOCUS_LABEL) as CriterionKey[]).map((k) => (
                <option key={k} value={k}>
                  {FOCUS_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Ghi chú trọng tâm</span>
            <input value={focusNote} onChange={(e) => setFocusNote(e.target.value)} placeholder="Ví dụ: Nhấn từ mang cảm xúc" />
          </label>
        </div>

        <div className="grid-2">
          <label className="field">
            <span>Cụm từ giao tiếp (tiếng Anh, không bắt buộc)</span>
            <input value={phraseEn} onChange={(e) => setPhraseEn(e.target.value)} placeholder="Ví dụ: I'm not in the mood." />
          </label>
          <label className="field">
            <span>Nghĩa tiếng Việt (không bắt buộc)</span>
            <input value={phraseVi} onChange={(e) => setPhraseVi(e.target.value)} placeholder="Ví dụ: Mình không có hứng." />
          </label>
        </div>

        <label className="field">
          <span>Câu hỏi IELTS Speaking (tiếng Anh, không bắt buộc)</span>
          <textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} />
        </label>
      </div>

      <div className="card form">
        <p className="label-strong">Nguồn câu</p>
        <div className="segmented" role="group" aria-label="Cách tạo bài">
          <button type="button" aria-pressed={mode === 'transcript'} className={mode === 'transcript' ? 'on' : ''} onClick={() => setMode('transcript')}>
            Dán transcript
          </button>
          <button type="button" aria-pressed={mode === 'audio'} className={mode === 'audio' ? 'on' : ''} onClick={() => setMode('audio')}>
            File audio / video
          </button>
          <button type="button" aria-pressed={mode === 'youtube'} className={mode === 'youtube' ? 'on' : ''} onClick={() => setMode('youtube')}>
            Video YouTube
          </button>
        </div>

        {mode === 'transcript' && (
          <>
            <label className="field">
              <span>Transcript: mỗi dòng là một câu tiếng Anh</span>
              <textarea rows={8} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder={TRANSCRIPT_EXAMPLE} />
            </label>
            <details className="help">
              <summary>Thêm gợi ý tự chấm (không bắt buộc)</summary>
              <p className="small">
                Viết theo dạng: <code>Câu đầy đủ || cụm 1 / cụm 2 / cụm 3 || TỪ_CẦN_NHẤN</code>. Các cụm ghép lại phải đúng bằng câu,
                và từ cần nhấn phải có trong câu. Dòng không có phần sau dấu || vẫn được dùng để nghe.
              </p>
            </details>
            <p className="small muted">Đã đọc {parsed.sentences.length} câu · tự chấm được {scorableCount} câu.</p>
            {parsed.errors.map((e) => (
              <p key={e} className="warn-text small">{e}</p>
            ))}
            <button type="button" className="btn" onClick={previewTranscript} disabled={parsed.sentences.length === 0}>
              Nghe thử câu đầu (en-US)
            </button>
          </>
        )}

        {mode === 'audio' && (
          <>
            <label className="field">
              <span>File audio hoặc video (giọng người thật)</span>
              <input type="file" accept="audio/*,video/*" onChange={(e) => onFileChange(e.target.files?.[0] ?? null)} />
            </label>
            {file && (
              <p className="small muted">
                {file.name} · {formatSize(file.size)} · {duration > 0 ? `${duration.toFixed(1)} giây` : 'đang đọc thời lượng…'}
              </p>
            )}
            {file && file.size > LARGE_FILE_BYTES && (
              <p className="warn-text small">
                File lớn hơn 150 MB. Trình duyệt có thể không đủ chỗ lưu; nên dùng clip ngắn hoặc file âm thanh (MP3, M4A).
              </p>
            )}
            <p className="small muted">Video chỉ dùng phần âm thanh. Nên cắt clip đúng từng câu để mốc thời gian dễ kiểm tra.</p>
          </>
        )}

        {mode === 'youtube' && (
          <>
            <label className="field">
              <span>Link YouTube</span>
              <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://youtu.be/…" inputMode="url" />
            </label>
            {youtubeUrl.trim() && !youtubeId && <p className="warn-text small">Link này không đọc được. Hãy dán link video YouTube đầy đủ.</p>}
            <p className="small muted">
              Video được phát bằng trình phát chính thức của YouTube, không tải về. Mốc thời gian nhập theo giây của video.
              YouTube chỉ có tốc độ 0.75× và 1.0×, nên tốc độ 0.9× sẽ phát ở 1.0×.
            </p>
          </>
        )}

        {mode === 'youtube' && (
          <details className="help" open={!ytRaw.trim()}>
            <summary>Tự tạo danh sách câu từ transcript YouTube</summary>
            <p className="small muted">
              Mở video trên YouTube, bấm <strong>…thêm</strong> dưới mô tả, chọn <strong>Hiển thị bản ghi</strong> (Show transcript),
              rồi copy toàn bộ và dán vào đây. App sẽ tách thành câu kèm mốc thời gian.
            </p>
            <textarea rows={6} value={ytRaw} onChange={(e) => setYtRaw(e.target.value)} placeholder={'0:05\nYou know we are presenting first, right?\n0:09 I had barely looked at the slides.'} />
            <button type="button" className="btn" onClick={fillFromYouTubeTranscript} disabled={!ytRaw.trim()}>
              Tạo danh sách câu
            </button>
          </details>
        )}

        {mode !== 'transcript' && (
          <>
            <label className="toggle">
              <input type="checkbox" checked={confirmSource} onChange={(e) => setConfirmSource(e.target.checked)} />
              {mode === 'audio'
                ? 'Tôi xác nhận file này dùng giọng Anh–Mỹ (en-US)'
                : 'Tôi có quyền dùng clip này cho lớp học và clip có giọng Anh–Mỹ'}
            </label>
            <p className="small muted">Nghe lại và kiểm tra mốc thời gian, từ cần nhấn và chỗ ngắt trước khi lưu.</p>

            <div className="rows">
              {rows.map((row, i) => (
                <div key={i} className="row-editor">
                  <div className="row-head">
                    <strong>Câu {i + 1}</strong>
                    <button type="button" className="btn ghost small danger" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}>
                      Xóa
                    </button>
                  </div>
                  <label className="field">
                    <span>Nội dung câu</span>
                    <input value={row.text} onChange={(e) => updateRow(i, { text: e.target.value })} />
                  </label>
                  <div className="grid-2">
                    <label className="field">
                      <span>Bắt đầu (giây)</span>
                      <input inputMode="decimal" value={row.start} onChange={(e) => updateRow(i, { start: e.target.value })} />
                    </label>
                    <label className="field">
                      <span>Kết thúc (giây)</span>
                      <input inputMode="decimal" value={row.end} onChange={(e) => updateRow(i, { end: e.target.value })} />
                    </label>
                  </div>
                  <div className="grid-2">
                    <label className="field">
                      <span>Cụm (ngăn bằng /)</span>
                      <input value={row.chunks} onChange={(e) => updateRow(i, { chunks: e.target.value })} />
                    </label>
                    <label className="field">
                      <span>Từ cần nhấn</span>
                      <input value={row.stress} onChange={(e) => updateRow(i, { stress: e.target.value })} />
                    </label>
                  </div>
                  {timeErrors[i] && <p className="warn-text small">{timeErrors[i]}</p>}
                  {!timeErrors[i] && rowResults[i].warning && <p className="warn-text small">{rowResults[i].warning}</p>}
                  {mode === 'audio' && (
                    <button type="button" className="btn" onClick={() => previewRow(i)} disabled={Boolean(timeErrors[i]) || !audioUrl}>
                      Nghe đoạn này
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="btn" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
              + Thêm câu
            </button>
          </>
        )}
      </div>

      {message && (
        <div className={message.kind === 'error' ? 'notice error' : message.kind === 'warn' ? 'notice warn' : 'notice'} role="status">
          {message.text}
        </div>
      )}

      <button type="button" className="btn primary big" onClick={save} disabled={saving}>
        {saving ? 'Đang lưu…' : 'Lưu bài'}
      </button>
    </section>
  );
}

function TeacherLogin({ signedIn }: { signedIn: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (signedIn) {
    return (
      <div className="card form">
        <p>Đã đăng nhập giáo viên. Bài bạn lưu sẽ hiển thị cho mọi học sinh.</p>
        <button type="button" className="btn" onClick={() => signOut()}>
          Đăng xuất
        </button>
      </div>
    );
  }

  return (
    <form
      className="card form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await signIn(email.trim(), password);
          setPassword('');
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="label-strong">Đăng nhập giáo viên</p>
      <label className="field">
        <span>Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
      </label>
      <label className="field">
        <span>Mật khẩu</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </label>
      {error && <p className="warn-text small">{error}</p>}
      <button type="submit" className="btn primary" disabled={busy || !email || !password}>
        {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
    </form>
  );
}
