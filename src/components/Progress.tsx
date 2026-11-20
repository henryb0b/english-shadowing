import type { ProgressData, Story } from '../types';
import { SPEED_LABEL } from './labels';

interface Props {
  stories: Story[];
  progress: ProgressData;
  onReset: () => void;
}

export default function Progress({ stories, progress, onReset }: Props) {
  const titleOf = (id: string) => stories.find((s) => s.id === id)?.title ?? 'Bài đã xóa';
  const sentenceOf = (storyId: string, sentenceId: string) =>
    stories.find((s) => s.id === storyId)?.sentences.find((x) => x.id === sentenceId)?.text ?? '';

  const recent = [...progress.attempts].reverse().slice(0, 12);
  const doneStories = stories.filter((s) => progress.stories[s.id]?.ieltsDone).length;
  const listened = stories.filter((s) => progress.stories[s.id]?.listened).length;

  return (
    <section aria-labelledby="progress-title">
      <div className="section-head">
        <h2 id="progress-title">Tiến độ</h2>
        <p className="muted">
          Điểm bên dưới là <strong>Điểm tự đánh giá shadowing</strong>: chỉ dùng để so sánh các lượt luyện của bạn.
          Điểm này không quy đổi thành IELTS band và không phải điểm phát âm do AI chấm.
        </p>
      </div>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-num">{doneStories}/{stories.length}</span>
          <span className="stat-label">bài đã trả lời câu IELTS</span>
        </div>
        <div className="stat">
          <span className="stat-num">{listened}/{stories.length}</span>
          <span className="stat-label">bài đã nghe trọn</span>
        </div>
        <div className="stat">
          <span className="stat-num">{progress.attempts.length}</span>
          <span className="stat-label">lượt đã chấm</span>
        </div>
      </div>

      <h3 className="sub-title">Bài luyện</h3>
      <ul className="plain-list">
        {stories.map((s) => {
          const sp = progress.stories[s.id];
          const practiced = sp?.practicedSentences.length ?? 0;
          return (
            <li key={s.id} className="progress-row">
              <span className="row-title">{s.title}</span>
              <span className="muted">
                đã luyện {practiced}/{s.sentences.length} câu · {sp?.ieltsDone ? 'đã trả lời IELTS' : 'chưa trả lời IELTS'}
              </span>
            </li>
          );
        })}
      </ul>

      <h3 className="sub-title">Lượt chấm gần đây</h3>
      {recent.length === 0 && <p className="muted">Chưa có lượt chấm nào. Hãy thu âm một câu rồi tự chấm.</p>}
      <ul className="plain-list">
        {recent.map((a, i) => (
          <li key={`${a.at}-${i}`} className="attempt-row">
            <span className="score-pill">{a.total}/6</span>
            <span className="attempt-text">
              <strong>{titleOf(a.storyId)}</strong> · {SPEED_LABEL[a.speed]}
              <br />
              <span className="muted">{sentenceOf(a.storyId, a.sentenceId)}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="danger-zone">
        <button type="button" className="btn ghost danger" onClick={onReset}>
          Xóa tiến độ trên thiết bị này
        </button>
      </div>
    </section>
  );
}
