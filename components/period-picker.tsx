'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { dateRangeLabel, shiftDate, validRange } from '@/lib/model';

export default function PeriodPicker({
  from,
  to,
  min,
  max,
  onApply,
}: {
  from: string;
  to: string;
  min: string;
  max: string;
  onApply: (from: string, to: string) => void;
}) {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const changed = draftFrom !== from || draftTo !== to;
  const valid =
    validRange(draftFrom, draftTo) && draftFrom >= min && draftTo <= max;
  return (
    <form
      className="period-picker"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onApply(draftFrom, draftTo);
      }}
    >
      <div className="period-presets" aria-label="Быстрый выбор периода">
        {[4, 12, 26].map((weeks) => {
          const start = [min, shiftDate(max, -(weeks - 1) * 7)].sort().at(-1)!;
          return (
            <button
              type="button"
              key={weeks}
              aria-pressed={from === start && to === max}
              onClick={() => {
                setDraftFrom(start);
                setDraftTo(max);
                onApply(start, max);
              }}
            >
              {weeks} нед.
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={from === min && to === max}
          onClick={() => {
            setDraftFrom(min);
            setDraftTo(max);
            onApply(min, max);
          }}
        >
          Вся история
        </button>
      </div>
      <div className="dates">
        <label htmlFor="audit-from">
          <span>С</span>
          <Input
            id="audit-from"
            type="date"
            aria-label="Дата начала"
            min={min}
            max={max}
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            aria-invalid={changed && !valid}
          />
        </label>
        <label htmlFor="audit-to">
          <span>По</span>
          <Input
            id="audit-to"
            type="date"
            aria-label="Дата окончания"
            min={min}
            max={max}
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            aria-invalid={changed && !valid}
          />
        </label>
        <Button type="submit" disabled={!changed || !valid}>
          Применить
        </Button>
      </div>
      {changed && (
        <output className={`period-hint ${valid ? '' : 'negative'}`}>
          {valid
            ? 'Нажмите «Применить», чтобы обновить показатели.'
            : `Выберите даты по порядку в пределах ${dateRangeLabel(min, max)}.`}
        </output>
      )}
    </form>
  );
}
