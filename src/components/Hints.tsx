import { useState } from 'react';
import { markHintRevealed } from '../lib/telemetry';

interface Props {
  lessonSlug: string;
  hints: string[];
}

// Progressive hints, one at a time, gentle nudge first and near-solution last.
// Each reveal is telemetered so the dashboard can see hint dependence per lesson.
export default function Hints({ lessonSlug, hints }: Props) {
  const [revealed, setRevealed] = useState(0);

  const reveal = () => {
    const next = revealed + 1;
    setRevealed(next);
    void markHintRevealed(lessonSlug, next);
  };

  return (
    <div className="ex-hints">
      <ol>
        {hints.slice(0, revealed).map((h, i) => (
          <li key={i}>{h}</li>
        ))}
      </ol>
      {revealed < hints.length ? (
        <button type="button" className="ex-btn ex-btn-ghost" onClick={reveal}>
          {revealed === 0 ? 'Stuck? Reveal a hint' : 'Reveal another hint'}
        </button>
      ) : (
        <p className="ex-hints-done">That is every hint. Re-read the concept and try once more.</p>
      )}
    </div>
  );
}
