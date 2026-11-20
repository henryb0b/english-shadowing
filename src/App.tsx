import { useCallback, useEffect, useMemo, useState } from 'react';
import { BUILTIN_STORIES } from './data/stories';
import type { ProgressData, Story } from './types';
import {
  clearProgress,
  deleteAudio,
  loadProgress,
  loadTeacherLessons,
  loadVoiceName,
  saveProgress,
  saveTeacherLessons,
  saveVoiceName,
  emptyProgress,
} from './lib/storage';
import { getEnUSVoices, waitForVoices } from './lib/player';
import { cloudEnabled, deleteLesson as deleteCloudLesson, fetchLessons, getSession, insertLesson, onSessionChange } from './lib/cloud';
import type { Session } from '@supabase/supabase-js';
import { putAudio, getAudio } from './lib/storage';
import Library from './components/Library';
import Practice from './components/Practice';
import Progress from './components/Progress';
import CreateLesson from './components/CreateLesson';

type Tab = 'library' | 'progress' | 'create';

const TABS: { id: Tab; label: string }[] = [
  { id: 'library', label: 'Kho bài' },
  { id: 'progress', label: 'Tiến độ' },
  { id: 'create', label: 'Tạo bài luyện' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('library');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Story[]>(() => (cloudEnabled ? [] : loadTeacherLessons()));
  const [session, setSession] = useState<Session | null>(null);
  const isTeacher = !cloudEnabled || session !== null;
  const [progress, setProgress] = useState<ProgressData>(() => loadProgress());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string | null>(() => loadVoiceName());
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const stories = useMemo(() => [...BUILTIN_STORIES, ...lessons], [lessons]);
  const active = stories.find((s) => s.id === activeId) ?? null;
  const voice = useMemo(
    () => voices.find((v) => v.name === voiceName) ?? voices[0] ?? null,
    [voices, voiceName],
  );

  useEffect(() => {
    let alive = true;
    waitForVoices().then((list) => {
      if (alive) setVoices(list);
    });
    const onChange = () => setVoices(getEnUSVoices());
    const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    synth?.addEventListener('voiceschanged', onChange);
    return () => {
      alive = false;
      synth?.removeEventListener('voiceschanged', onChange);
    };
  }, []);

  useEffect(() => {
    if (!cloudEnabled) return;
    let alive = true;
    fetchLessons()
      .then((list) => alive && setLessons(list))
      .catch((err: Error) => alive && setStorageWarning(err.message));
    getSession().then((s) => alive && setSession(s));
    const unsubscribe = onSessionChange((s) => setSession(s));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const updateProgress = useCallback((fn: (p: ProgressData) => ProgressData) => {
    setProgress((prev) => {
      const next = fn(prev);
      if (!saveProgress(next)) {
        setStorageWarning(
          'Trình duyệt này không lưu được tiến độ (có thể đang ở chế độ riêng tư). Tiến độ chỉ còn trong phiên này.',
        );
      }
      return next;
    });
  }, []);

  const chooseVoice = (name: string) => {
    saveVoiceName(name);
    setVoiceName(name);
  };

  /** Saves a new lesson: to shared storage when configured, otherwise on this device. Returns warnings to show. */
  const addLesson = async (story: Story, file: File | null): Promise<string[]> => {
    if (cloudEnabled) {
      await insertLesson(story, file);
      setLessons((prev) => [...prev, story]);
      return [];
    }
    const warnings: string[] = [];
    if (file) {
      const audioId = `${story.id}-audio`;
      const stored = await putAudio(audioId, file);
      const readBack = stored ? await getAudio(audioId) : null;
      if (readBack) {
        story.audioId = audioId;
        story.audioPersistent = true;
      } else {
        story.audioPersistent = false;
        warnings.push(
          'Trình duyệt này không giữ được file audio qua lần tải lại trang. Bài vẫn được lưu, nhưng audio sẽ không còn sau khi tải lại; khi đó bài dùng giọng đọc tổng hợp nếu thiết bị có en-US.',
        );
      }
    }
    const next = [...lessons, story];
    setLessons(next);
    saveTeacherLessons(next);
    return warnings;
  };

  const removeLesson = async (story: Story) => {
    if (!window.confirm(`Xóa bài "${story.title}"?`)) return;
    if (cloudEnabled) {
      try {
        await deleteCloudLesson(story);
      } catch (err) {
        setStorageWarning((err as Error).message);
        return;
      }
      setLessons((prev) => prev.filter((l) => l.id !== story.id));
      return;
    }
    const next = lessons.filter((l) => l.id !== story.id);
    setLessons(next);
    saveTeacherLessons(next);
    if (story.audioId) await deleteAudio(story.audioId);
  };

  const resetProgress = () => {
    if (!window.confirm('Xóa toàn bộ tiến độ và điểm đã lưu trên thiết bị này?')) return;
    clearProgress();
    setProgress(emptyProgress());
  };

  const openStory = (id: string) => {
    setActiveId(id);
  };

  const pickTab = (next: Tab) => {
    setActiveId(null);
    setTab(next);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">IS</span>
          <div>
            <h1>IELTS Shadowing Lab</h1>
            <p>Luyện shadowing tiếng Anh–Mỹ qua câu chuyện đời thường</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Khu vực chính">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={!active && tab === t.id ? 'tab active' : 'tab'}
              aria-current={!active && tab === t.id ? 'page' : undefined}
              onClick={() => pickTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {storageWarning && (
          <div className="notice warn" role="status">
            {storageWarning}
          </div>
        )}

        {active ? (
          <Practice
            key={active.id}
            story={active}
            progress={progress}
            updateProgress={updateProgress}
            voices={voices}
            voice={voice}
            onVoiceChange={chooseVoice}
            onBack={() => setActiveId(null)}
          />
        ) : tab === 'library' ? (
          <Library stories={stories} progress={progress} onOpen={openStory} onDelete={removeLesson} canEdit={isTeacher} />
        ) : tab === 'progress' ? (
          <Progress stories={stories} progress={progress} onReset={resetProgress} />
        ) : (
          <CreateLesson voice={voice} onSave={addLesson} onDone={() => setTab('library')} cloudEnabled={cloudEnabled} isTeacher={isTeacher} />
        )}
      </main>
    </div>
  );
}
