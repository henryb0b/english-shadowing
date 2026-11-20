import { useMemo, useState } from 'react';
import type { Difficulty, IeltsPart, ProgressData, Story } from '../types';
import { partLabel } from './labels';

interface Props {
  stories: Story[];
  progress: ProgressData;
  onOpen: (id: string) => void;
  onDelete: (story: Story) => void;
  canEdit: boolean;
}

const DIFFICULTIES: ('Tất cả' | Difficulty)[] = ['Tất cả', 'Cơ bản', 'Trung bình', 'Nâng cao'];
const PARTS: ('Tất cả' | IeltsPart)[] = ['Tất cả', 1, 2, 3];

export default function Library({ stories, progress, onOpen, onDelete, canEdit }: Props) {
  const [difficulty, setDifficulty] = useState<'Tất cả' | Difficulty>('Tất cả');
  const [part, setPart] = useState<'Tất cả' | IeltsPart>('Tất cả');

  const visible = useMemo(
    () =>
      stories.filter(
        (s) =>
          (difficulty === 'Tất cả' || s.difficulty === difficulty) &&
          (part === 'Tất cả' || s.part === part),
      ),
    [stories, difficulty, part],
  );

  return (
    <section aria-labelledby="library-title">
      <div className="section-head">
        <h2 id="library-title">Kho bài</h2>
        <p className="muted">Mỗi bài có một câu chuyện, một cụm từ giao tiếp và một câu hỏi IELTS Speaking.</p>
      </div>

      <div className="filters">
        <div className="filter-group" role="group" aria-label="Lọc theo độ khó">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              className={difficulty === d ? 'chip on' : 'chip'}
              aria-pressed={difficulty === d}
              onClick={() => setDifficulty(d)}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="filter-group" role="group" aria-label="Lọc theo Part">
          {PARTS.map((p) => (
            <button
              key={String(p)}
              type="button"
              className={part === p ? 'chip on' : 'chip'}
              aria-pressed={part === p}
              onClick={() => setPart(p)}
            >
              {p === 'Tất cả' ? 'Mọi Part' : `Part ${p}`}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 && <p className="muted">Không có bài nào khớp bộ lọc.</p>}

      <div className="card-grid">
        {visible.map((story) => {
          const sp = progress.stories[story.id];
          const scorable = story.sentences.filter((s) => s.scorable).length;
          const practiced = sp?.practicedSentences.length ?? 0;
          return (
            <article key={story.id} className="story-card">
              <div className="badges">
                <span className={`badge diff-${story.difficulty === 'Cơ bản' ? 'easy' : story.difficulty === 'Trung bình' ? 'mid' : 'hard'}`}>
                  {story.difficulty}
                </span>
                <span className="badge">{partLabel(story.part)}</span>
                {story.source === 'teacher' && <span className="badge teacher">Giáo viên</span>}
                {story.youtubeId && <span className="badge">YouTube</span>}
              </div>
              <h3>{story.title}</h3>
              <p className="opening">“{story.sentences[0]?.text}”</p>
              <p className="meta">
                {story.sentences.length} câu · {scorable} câu tự chấm · đã luyện {practiced}/{story.sentences.length}
              </p>
              <div className="card-actions">
                <button type="button" className="btn primary" onClick={() => onOpen(story.id)}>
                  Mở bài
                </button>
                {story.source === 'teacher' && canEdit && (
                  <button type="button" className="btn ghost danger" onClick={() => onDelete(story)}>
                    Xóa bài
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
