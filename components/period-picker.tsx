'use client';
import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { dateRangeLabel, shortDate, shiftDate, validRange } from '@/lib/model';

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
  const [draftFrom, setDraftFrom] = useState(from),
    [draftTo, setDraftTo] = useState(to);
  const [open, setOpen] = useState(false);
  const valid =
    validRange(draftFrom, draftTo) && draftFrom >= min && draftTo <= max;
  const changed = draftFrom !== from || draftTo !== to;
  return (
    <div className="period-picker">
      <span className="history-label">История</span>
      <div className="period-presets" aria-label="Глубина истории графиков">
        {[4, 12, 26].map((weeks) => {
          const start = [min, shiftDate(max, -(weeks - 1) * 7)].sort().at(-1)!;
          return (
            <button
              type="button"
              key={weeks}
              aria-pressed={from === start && to === max}
              onClick={() => onApply(start, max)}
            >
              {weeks} нед.
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={from === min && to === max}
          onClick={() => onApply(min, max)}
        >
          Всё время
        </button>
      </div>
      <Popover
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (value) {
            setDraftFrom(from);
            setDraftTo(to);
          }
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="custom-period"
              aria-label={`Изменить историю: ${dateRangeLabel(from, to)}`}
            >
              <CalendarDays size={15} />
              {shortDate(from)}.{from.slice(2, 4)} — {shortDate(to)}.
              {to.slice(2, 4)}
            </Button>
          }
        />
        <PopoverContent align="start" className="period-popover">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) {
                onApply(draftFrom, draftTo);
                setOpen(false);
              }
            }}
          >
            <h3>История графиков</h3>
            <p>Изменение в карточках всегда считается неделя к неделе.</p>
            <div className="dates">
              <label htmlFor="audit-from">
                <span>С</span>
                <Input
                  id="audit-from"
                  type="date"
                  aria-label="Дата начала"
                  value={draftFrom}
                  min={min}
                  max={max}
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
                  value={draftTo}
                  min={min}
                  max={max}
                  onChange={(e) => setDraftTo(e.target.value)}
                  aria-invalid={changed && !valid}
                />
              </label>
            </div>
            {changed && !valid && (
              <output className="period-hint negative">
                Выберите даты по порядку в пределах {dateRangeLabel(min, max)}.
              </output>
            )}
            <Button type="submit" disabled={!valid}>
              Применить период
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
