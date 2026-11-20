import { useCallback, useEffect, useRef, useState } from 'react';
import type { CriterionKey, ProgressData, ScoreAttempt, Speed, Story, StoryProgress } from '../types';
import { LessonPlayer } from '../lib/player';
import { CRITERIA, coachingMessage, totalScore, tipFor, type Scores } from '../lib/scoring';
import { getAudio } from '../lib/storage';
import { YouTubeSegmentPlayer } from '../lib/youtube';
import { partLabel, SPEED_LABEL, FOCUS_LABEL } from './labels';

type LoopMode = 'once' | 'x3' | 'infinite';
const LOOP_TIMES: Record<LoopMode, number> = { once: 1, x3: 3, infinite: Number.POSITIVE_INFINITY };
const LOOP_LABEL: Record<LoopMode, string> = { once: '1 lần', x3: '3 lần', infinite: 'Đến khi dừng' };
const SPEEDS: Speed[] = [0.75, 0.9, 1];
const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const takeKeyOf = (storyId: string, sentenceId: string) => `${storyId}:${sentenceId}`;

function patchStory(p: ProgressData, storyId: string, patch: (sp: StoryProgress) => StoryProgress): ProgressData {
  const current: StoryProgress = p.stories[storyId] ?? { listened: false, ieltsDone: false, practicedSentences: [] };
  return { ...p, stories: { ...p.stories, [storyId]: patch(current) } };
}

interface Props {
  story: Story;
  progress: ProgressData;
  updateProgress: (fn: (p: ProgressData) => ProgressData) => void;
  voices: SpeechSynthesisVoice[];
  voice: SpeechSynthesisVoice | null;
  onVoiceChange: (name: string) => void;
  onBack: () => void;
}

export default function Practice({ story, progress, updateProgress, voices, voice, onVoiceChange, onBack }: Props) {
  const sentences = story.sentences;
  const [player] = useState(() => new LessonPlayer());
  const [audioState, setAudioState] = useState<'none' | 'loading' | 'ready' | 'missing'>(
    story.audioId ? 'loading' : 'none',
  );
  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useState<Speed>(0.9);
  const [loopMode, setLoopMode] = useState<LoopMode>('once');
  const [showTranscript, setShowTranscript] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [headphones, setHeadphones] = useState(false);
  const [busy, setBusy] = useState<'idle' | 'sentence' | 'all'>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [takeTick, setTakeTick] = useState(0);
  const [scores, setScores] = useState<Scores>({});
  const [skipped, setSkipped] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);

  const takesRef = useRef(new Map<string, { url: string; seconds: number }>());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef(0);
  const genRef = useRef(0);
  const takeAudioRef = useRef<HTMLAudioElement | null>(null);
  const disposedRef = useRef(false);

  const current = sentences[idx];
  const sp = progress.stories[story.id];
  const take = takesRef.current.get(takeKeyOf(story.id, current.id));
  const complete = totalScore(scores);
  const isYouTube = Boolean(story.youtubeId);
  const ytRef = useRef<HTMLDivElement>(null);
  const hasSource = audioState === 'ready' || isYouTube || voice !== null;
  const attemptsHere = progress.attempts.filter((a) => a.storyId === story.id && a.sentenceId === current.id);
  const lastHere = attemptsHere[attemptsHere.length - 1];
  const stepsDone = {
    listen: Boolean(sp?.listened),
    sentence: (sp?.practicedSentences.length ?? 0) > 0,
    shadow: takeTick > 0 || takesRef.current.size > 0,
    review: reviewed,
    score: progress.attempts.some((a) => a.storyId === story.id),
    ielts: Boolean(sp?.ieltsDone),
  };
  const stepList: [keyof typeof stepsDone, string][] = [
    ['listen', 'Nghe cả bài'],
    ['sentence', 'Nghe từng câu'],
    ['shadow', 'Nói đuổi & thu âm'],
    ['review', 'Nghe bản thu'],
    ['score', 'Tự chấm'],
    ['ielts', 'Trả lời IELTS'],
  ];

  /* Load teacher audio, if any. */
  useEffect(() => {
    if (!story.audioId) {
      player.setAudioSource(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    getAudio(story.audioId).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setAudioState('missing');
        return;
      }
      url = URL.createObjectURL(blob);
      player.setAudioSource(url);
      setAudioState('ready');
    });
    return () => {
      cancelled = true;
      player.stop();
      player.setAudioSource(null);
      if (url) URL.revokeObjectURL(url);
    };
  }, [story.audioId, player]);

  /* YouTube source: embed the official player and route sentence ranges to it. */
  useEffect(() => {
    const el = ytRef.current;
    if (!story.youtubeId || !el) return;
    // The YouTube API replaces the element it is given, so it gets its own child host.
    const host = document.createElement('div');
    el.appendChild(host);
    const yt = new YouTubeSegmentPlayer(host, story.youtubeId);
    player.setYouTube(yt);
    return () => {
      player.setYouTube(null);
      yt.destroy();
      host.remove();
    };
  }, [story.youtubeId, player]);

  /* Clean up on leaving the screen. */
  useEffect(() => {
    disposedRef.current = false;
    const takes = takesRef.current;
    return () => {
      disposedRef.current = true;
      genRef.current++;
      player.stop();
      window.clearInterval(timerRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') rec.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      takeAudioRef.current?.pause();
      takes.forEach((t) => URL.revokeObjectURL(t.url));
      takes.clear();
    };
  }, [player]);

  const stopAll = useCallback(() => {
    genRef.current++;
    player.stop();
    takeAudioRef.current?.pause();
    setBusy('idle');
  }, [player]);

  const needSource = () => {
    setNotice(
      story.audioId
        ? 'Bài này dùng file audio của giáo viên, nhưng file không còn trên thiết bị. Hãy tạo lại bài để thêm audio.'
        : 'Thiết bị này chưa có giọng đọc en-US. Hãy cài giọng English (United States) trong cài đặt hệ thống, rồi tải lại trang. Transcript vẫn xem được.',
    );
  };

  /** Plays the current sentence `times` times. Resolves true only if every repeat finished. */
  const playSentenceLoop = async (index: number, times: number): Promise<boolean> => {
    const gen = ++genRef.current;
    setBusy('sentence');
    let completed = true;
    for (let k = 0; k < times; k++) {
      if (genRef.current !== gen) {
        completed = false;
        break;
      }
      const ok = await player.playSentence(sentences[index], speed, voice);
      if (genRef.current !== gen || !ok) {
        completed = false;
        break;
      }
      if (k < times - 1) await delay(500);
    }
    if (genRef.current === gen) setBusy('idle');
    return completed;
  };

  const playModel = async () => {
    if (!hasSource) return needSource();
    setNotice(null);
    const ok = await playSentenceLoop(idx, LOOP_TIMES[loopMode]);
    if (ok) {
      updateProgress((p) => patchStory(p, story.id, (s) => ({
        ...s,
        practicedSentences: s.practicedSentences.includes(current.id)
          ? s.practicedSentences
          : [...s.practicedSentences, current.id],
      })));
    }
  };

  const playAll = async () => {
    if (!hasSource) return needSource();
    setNotice(null);
    const gen = ++genRef.current;
    setBusy('all');
    let completed = true;
    for (let i = 0; i < sentences.length; i++) {
      if (genRef.current !== gen) {
        completed = false;
        break;
      }
      setIdx(i);
      const ok = await player.playSentence(sentences[i], speed, voice);
      if (genRef.current !== gen || !ok) {
        completed = false;
        break;
      }
      await delay(350);
    }
    if (genRef.current === gen) setBusy('idle');
    if (completed) updateProgress((p) => patchStory(p, story.id, (s) => ({ ...s, listened: true })));
  };

  const goTo = (i: number) => {
    if (i < 0 || i >= sentences.length) return;
    stopAll();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    setIdx(i);
    setScores({});
    setSkipped(false);
    setSavedMsg(null);
    setReviewed(false);
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  };

  const startRecording = async () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNotice('Thiết bị hoặc trình duyệt này không hỗ trợ thu âm. Bạn vẫn nghe mẫu và xem transcript được.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      const name = (err as DOMException).name;
      setNotice(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Micro đang bị chặn. Hãy cho phép micro cho trang này trong cài đặt trình duyệt, rồi thử lại. Phần nghe mẫu vẫn hoạt động.'
          : name === 'NotFoundError'
            ? 'Không tìm thấy micro trên thiết bị này. Phần nghe mẫu vẫn hoạt động.'
            : 'Không mở được micro. Hãy thử lại. Phần nghe mẫu vẫn hoạt động.',
      );
      return;
    }
    if (disposedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const key = takeKeyOf(story.id, current.id);
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    streamRef.current = stream;
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      window.clearInterval(timerRef.current);
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      if (disposedRef.current) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      if (blob.size === 0) {
        setNotice('Bản thu trống. Hãy kiểm tra micro rồi thu lại.');
        return;
      }
      const old = takesRef.current.get(key);
      if (old) URL.revokeObjectURL(old.url);
      takesRef.current.set(key, {
        url: URL.createObjectURL(blob),
        seconds: Math.round((Date.now() - startedAt) / 1000),
      });
      setTakeTick((t) => t + 1);
      setScores({});
      setSkipped(false);
      setSavedMsg(null);
      setReviewed(false);
    };

    recorder.start(250);
    setRecSeconds(0);
    setRecording(true);
    setNotice(
      headphones
        ? null
        : 'Bạn đang dùng loa: giọng mẫu có thể lọt vào bản thu. Hãy đeo tai nghe để bản thu rõ hơn.',
    );
    window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(
      () => setRecSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      250,
    );

    if (!hasSource) return;
    const completed = await playSentenceLoop(idx, LOOP_TIMES[loopMode]);
    if (completed && loopMode !== 'infinite') {
      await delay(1200);
      if (recorderRef.current === recorder && recorder.state !== 'inactive') recorder.stop();
    }
  };

  const playTake = () => {
    if (!take) return;
    stopAll();
    const audio = new Audio(take.url);
    takeAudioRef.current = audio;
    setReviewed(true);
    audio.play().catch(() => setNotice('Trình duyệt không phát được bản thu này.'));
  };

  const saveScore = () => {
    if (complete === null) return;
    const attempt: ScoreAttempt = {
      storyId: story.id,
      sentenceId: current.id,
      speed,
      rhythm: scores.rhythm!,
      phrase: scores.phrase!,
      stress: scores.stress!,
      total: complete,
      at: new Date().toISOString(),
    };
    const sameSpeed = attemptsHere.filter((a) => a.speed === speed);
    const pair = [...sameSpeed, attempt].slice(-2);
    updateProgress((p) => ({
      ...patchStory(p, story.id, (s) => ({
        ...s,
        practicedSentences: s.practicedSentences.includes(current.id)
          ? s.practicedSentences
          : [...s.practicedSentences, current.id],
      })),
      attempts: [...p.attempts, attempt],
    }));
    setSavedMsg(
      pair.length === 2
        ? `Hai lượt gần nhất ở ${SPEED_LABEL[speed]}: ${pair[0].total}/6 → ${pair[1].total}/6.`
        : `Đã lưu ${complete}/6 ở ${SPEED_LABEL[speed]}. Lượt sau ở cùng tốc độ sẽ có so sánh.`,
    );
  };

  const toggleScore = (key: CriterionKey, value: 0 | 1 | 2) => {
    setSkipped(false);
    setSavedMsg(null);
    setScores((prev) => ({ ...prev, [key]: value }));
  };

  const statusOf = (sid: string) => {
    const list = progress.attempts.filter((a) => a.storyId === story.id && a.sentenceId === sid);
    const last = list[list.length - 1];
    return last ? `${last.total}/6` : 'Chưa tự chấm';
  };

  const transcriptVisible = showTranscript;
  const playingLabel = busy === 'idle' ? null : busy === 'all' ? 'Đang phát cả bài' : 'Đang phát mẫu';

  return (
    <section className="practice" aria-label={`Luyện bài ${story.title}`}>
      <button type="button" className="back" onClick={onBack}>
        ← Kho bài
      </button>

      <header className="practice-head">
        <div className="badges">
          <span className="badge">{story.difficulty}</span>
          <span className="badge">{partLabel(story.part)}</span>
          {story.source === 'teacher' && <span className="badge teacher">Giáo viên</span>}
          {story.youtubeId && <span className="badge">YouTube</span>}
        </div>
        <h2>{story.title}</h2>
        <p className="phrase">
          Cụm từ dùng ngoài bài: <strong>“{story.phrase.en}”</strong> <span className="muted">({story.phrase.vi})</span>
        </p>
        <p className="focus-note">
          <strong>Trọng tâm: {FOCUS_LABEL[story.focus]}.</strong> {story.focusNote}
        </p>
      </header>

      {isYouTube && (
        <div className="yt-wrap" ref={ytRef} />
      )}

      <div className="voice-box">
        {isYouTube && (
          <p>
            Giọng mẫu lấy từ video YouTube của giáo viên. YouTube chỉ có tốc độ 0.75× và 1.0×, nên 0.9× sẽ phát ở 1.0×.
          </p>
        )}
        {audioState === 'ready' && (
          <p>Đang dùng file audio giáo viên tải lên. Giáo viên đã xác nhận file dùng giọng Anh–Mỹ.</p>
        )}
        {audioState === 'missing' && (
          <p className="warn-text">File audio của bài này không còn trên thiết bị. Hãy tạo lại bài để thêm audio.</p>
        )}
        {isYouTube ? null : voice ? (
          <p>
            <span className="label-strong">Giọng đọc tổng hợp:</span> {voice.name} · en-US
            {voices.length > 1 && (
              <label className="inline-select">
                <span className="sr-only">Chọn giọng</span>
                <select value={voice.name} onChange={(e) => onVoiceChange(e.target.value)}>
                  {voices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </p>
        ) : audioState !== 'ready' && !isYouTube && (
          <p className="warn-text">
            Thiết bị này chưa có giọng đọc en-US. Hãy cài giọng English (United States) rồi tải lại trang. Transcript vẫn xem được.
          </p>
        )}
      </div>

      <ol className="steps" aria-label="Lộ trình luyện">
        {stepList.map(([key, label], i) => (
          <li key={key} className={stepsDone[key] ? 'step done' : 'step'}>
            <span className="step-num">{stepsDone[key] ? '✓' : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}

      <div className="controls card">
        <div className="control-row">
          {busy === 'idle' ? (
            <button type="button" className="btn primary big" onClick={playModel}>
              ▶ Phát mẫu
            </button>
          ) : (
            <button type="button" className="btn danger big" onClick={stopAll}>
              ■ Dừng
            </button>
          )}
          <button type="button" className="btn" onClick={playAll} disabled={busy !== 'idle'}>
            Phát cả bài
          </button>
        </div>
        {playingLabel && <p className="playing" aria-live="polite">{playingLabel}</p>}

        <div className="control-row nav">
          <button type="button" className="btn" onClick={() => goTo(idx - 1)} disabled={idx === 0}>
            ← Câu trước
          </button>
          <button type="button" className="btn" onClick={() => goTo(idx + 1)} disabled={idx === sentences.length - 1}>
            Câu sau →
          </button>
        </div>

        <div className="setting">
          <span className="setting-label">Tốc độ mẫu</span>
          <div className="segmented" role="group" aria-label="Tốc độ mẫu">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                className={speed === s ? 'on' : ''}
                onClick={() => {
                  stopAll();
                  setSpeed(s);
                }}
              >
                {SPEED_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="setting">
          <span className="setting-label">Lặp mỗi câu</span>
          <div className="segmented" role="group" aria-label="Lặp mẫu">
            {(Object.keys(LOOP_LABEL) as LoopMode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={loopMode === m}
                className={loopMode === m ? 'on' : ''}
                onClick={() => {
                  stopAll();
                  setLoopMode(m);
                }}
              >
                {LOOP_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="toggles">
          <label className="toggle">
            <input type="checkbox" checked={showTranscript} onChange={(e) => setShowTranscript(e.target.checked)} />
            Hiện transcript
          </label>
          <label className="toggle">
            <input type="checkbox" checked={showHints} onChange={(e) => setShowHints(e.target.checked)} />
            Hiện gợi ý
          </label>
          <label className="toggle">
            <input type="checkbox" checked={headphones} onChange={(e) => setHeadphones(e.target.checked)} />
            Tôi đang đeo tai nghe
          </label>
        </div>
      </div>

      <div className="card current">
        <p className="counter">Câu {idx + 1}/{sentences.length}</p>
        {transcriptVisible ? (
          <p className="current-text">{current.text}</p>
        ) : (
          <p className="hidden-text">Transcript đang ẩn. Hãy nghe trước, rồi bật transcript khi cần.</p>
        )}

        {showHints && (
          <div className="hints">
            {current.chunks && current.stress ? (
              <>
                <p>
                  <span className="label-strong">Ngắt cụm:</span> {current.chunks.join(' / ')}
                </p>
                <p>
                  <span className="label-strong">Từ cần nhấn:</span> <mark>{current.stress}</mark>
                </p>
                <p>
                  <span className="label-strong">Nhịp:</span> {tipFor('rhythm', current)}
                </p>
              </>
            ) : (
              <p className="muted">Câu này chưa có gợi ý nhịp, chỉ dùng để nghe.</p>
            )}
          </div>
        )}
        <p className="status">
          Trạng thái: {current.scorable ? statusOf(current.id) : 'Chỉ nghe'}
          {lastHere && current.scorable ? ` · lượt gần nhất ở ${SPEED_LABEL[lastHere.speed]}` : ''}
        </p>
      </div>

      <div className="card recorder">
        <h3>Nói đuổi theo mẫu</h3>
        <p className="muted small">
          Bấm thu rồi nói theo mẫu. Bản mẫu sẽ phát theo cài đặt lặp. Khi mẫu phát xong, thu âm tự dừng sau một lúc ngắn.
        </p>
        <div className="control-row">
          {recording ? (
            <button type="button" className="btn danger big" onClick={stopRecording}>
              ● Dừng thu ({formatTime(recSeconds)})
            </button>
          ) : (
            <button type="button" className="btn primary big" onClick={startRecording}>
              ● Thu và nói đuổi
            </button>
          )}
        </div>
        {recording && <p className="rec-status" aria-live="polite">Đang thu · {formatTime(recSeconds)}</p>}
        <div className="control-row">
          <button type="button" className="btn" onClick={playModel} disabled={busy !== 'idle' || recording}>
            Nghe mẫu
          </button>
          <button type="button" className="btn" onClick={playTake} disabled={!take || recording}>
            Nghe bản thu
          </button>
          <button type="button" className="btn" onClick={startRecording} disabled={recording}>
            Thu lại
          </button>
        </div>
        {take && <p className="muted small">Bản thu chỉ giữ trong phiên này, không tải lên máy chủ.</p>}
      </div>

      {take && !recording && current.scorable && (
        <div className="card scorecard">
          <h3>Điểm tự đánh giá shadowing</h3>
          <p className="muted small">
            Chấm sau khi nghe bản thu so với mẫu. Điểm này chỉ dùng để luyện shadowing, không quy đổi thành IELTS band.
          </p>
          {CRITERIA.map((c) => (
            <div key={c.key} className="criterion">
              <p className="criterion-title">
                {c.label}
                {story.focus === c.key && <span className="badge small">Trọng tâm bài</span>}
              </p>
              <div className="segmented three" role="group" aria-label={c.label}>
                {([0, 1, 2] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={scores[c.key] === v}
                    className={scores[c.key] === v ? 'on' : ''}
                    title={c.levels[v]}
                    onClick={() => toggleScore(c.key, v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {scores[c.key] !== undefined && <p className="level-text small">{c.levels[scores[c.key]!]}</p>}
            </div>
          ))}

          {complete !== null ? (
            <div className="result">
              <p className="result-total">{complete}/6</p>
              <p>{coachingMessage(scores, story.focus, current)}</p>
              <button type="button" className="btn primary" onClick={saveScore}>
                Lưu điểm
              </button>
            </div>
          ) : (
            <p className="muted small">Chọn đủ ba tiêu chí để xem tổng điểm.</p>
          )}
          {savedMsg && <p className="saved" role="status">{savedMsg}</p>}
          {!savedMsg && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setSkipped(true);
                setScores({});
              }}
            >
              Bỏ qua tự chấm
            </button>
          )}
          {skipped && <p className="muted small">Chưa tự chấm. Lượt này không được tính thành 0 điểm.</p>}
        </div>
      )}
      {take && !recording && !current.scorable && (
        <p className="muted small">Câu này chỉ dùng để luyện nghe, nên không tự chấm.</p>
      )}

      <div className="card list-card">
        <h3>Danh sách câu</h3>
        <ol className="sentence-list">
          {sentences.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={i === idx ? 'sentence active' : 'sentence'}
                aria-current={i === idx ? 'step' : undefined}
                onClick={() => goTo(i)}
              >
                <span className="sentence-num">{i + 1}</span>
                <span className="sentence-text">{transcriptVisible ? s.text : `Câu ${i + 1} (ẩn)`}</span>
                <span className="sentence-status">{s.scorable ? statusOf(s.id) : 'Nghe'}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="card ielts">
        <p className="label-strong">
          Câu hỏi IELTS Speaking{story.part === 2 ? ' · Đoạn trích luyện kể' : ''}
        </p>
        <p className="question">{story.ieltsQuestion}</p>
        <p className="muted small">
          {story.part === 1 && 'Trả lời ngắn, nêu thói quen hoặc sở thích của bạn và giải thích thêm một lý do.'}
          {story.part === 2 && 'Kể lại trải nghiệm của bạn trong khoảng 1–2 phút, theo thứ tự thời gian.'}
          {story.part === 3 && 'Trả lời bằng ý kiến của bạn, có lý do và một ví dụ, rồi mở rộng ra xã hội nói chung.'}
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={Boolean(sp?.ieltsDone)}
            onChange={(e) =>
              updateProgress((p) => patchStory(p, story.id, (s) => ({ ...s, ieltsDone: e.target.checked })))
            }
          />
          Tôi đã trả lời câu hỏi này
        </label>
      </div>
    </section>
  );
}

function formatTime(total: number): string {
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}
