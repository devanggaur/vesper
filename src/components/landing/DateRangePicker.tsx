import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Sparkles, X } from 'lucide-react';

/**
 * Trip Date & Duration Selector
 * -----------------------------
 * Supports two complementary travel-planning modes:
 * 1. Exact dates — dual-month range picker with live hover preview and ±1/2/3 day flexibility chips.
 * 2. Flexible — trip length (Weekend / Short trip / A week / 2 weeks) + up to 3 target months.
 */
export interface TripDateSelection {
  mode: 'exact' | 'flexible';
  startDate: Date | null;
  endDate: Date | null;
  tolerance: number; // 0, 1, 2, 3 days
  flexDuration: string;
  flexMonths: string[];
  label: string;
}

interface DateRangePickerProps {
  value: TripDateSelection;
  onChange: (next: TripDateSelection) => void;
  onClose: () => void;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const FLEX_DURATIONS = [
  { id: 'Weekend', label: 'Weekend', sub: '2–3 days' },
  { id: '4–5 days', label: 'Short trip', sub: '4–5 days' },
  { id: '1 week', label: 'A week', sub: '6–8 days' },
  { id: '2 weeks', label: '2 weeks', sub: '12–15 days' },
];

const FLEX_MONTH_CARDS = [
  { key: 'Dec 2026', month: 'Dec', year: '2026' },
  { key: 'Jan 2027', month: 'Jan', year: '2027' },
  { key: 'Feb 2027', month: 'Feb', year: '2027' },
  { key: 'Mar 2027', month: 'Mar', year: '2027' },
  { key: 'Apr 2027', month: 'Apr', year: '2027' },
  { key: 'May 2027', month: 'May', year: '2027' },
  { key: 'Jun 2026', month: 'Jun', year: '2026' },
  { key: 'Jul 2026', month: 'Jul', year: '2026' },
  { key: 'Aug 2026', month: 'Aug', year: '2026' },
  { key: 'Sep 2026', month: 'Sep', year: '2026' },
  { key: 'Oct 2026', month: 'Oct', year: '2026' },
  { key: 'Nov 2026', month: 'Nov', year: '2026' },
];

function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function stripTime(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatSelectionLabel(sel: Omit<TripDateSelection, 'label'>): string {
  if (sel.mode === 'flexible') {
    const months = sel.flexMonths.length > 0 ? sel.flexMonths.map((m) => m.split(' ')[0]).slice(0, 2).join(', ') : 'Anytime';
    return `${sel.flexDuration} · ${months}`;
  }
  if (!sel.startDate) return 'Add dates';
  const sMon = MONTH_SHORT[sel.startDate.getMonth()];
  const sDay = sel.startDate.getDate();
  if (!sel.endDate) return `${sMon} ${sDay}`;
  const eMon = MONTH_SHORT[sel.endDate.getMonth()];
  const eDay = sel.endDate.getDate();
  const nights = Math.max(1, Math.round((stripTime(sel.endDate) - stripTime(sel.startDate)) / 86400000));
  const rangeStr = sMon === eMon ? `${sMon} ${sDay} – ${eDay}` : `${sMon} ${sDay} – ${eMon} ${eDay}`;
  const tolStr = sel.tolerance > 0 ? ` ±${sel.tolerance}d` : '';
  return `${rangeStr}${tolStr} (${nights}n)`;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({ value, onChange, onClose }) => {
  const [tab, setTab] = useState<'exact' | 'flexible'>(value.mode);
  const [startDate, setStartDate] = useState<Date | null>(value.startDate);
  const [endDate, setEndDate] = useState<Date | null>(value.endDate);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [tolerance, setTolerance] = useState<number>(value.tolerance);
  const [flexDuration, setFlexDuration] = useState<string>(value.flexDuration || 'Weekend');
  const [flexMonths, setFlexMonths] = useState<string[]>(
    value.flexMonths.length > 0 ? value.flexMonths : ['Jun 2026']
  );

  // Start calendar view on startDate's month (defaults to June 2026)
  const [viewYear, setViewYear] = useState<number>(value.startDate ? value.startDate.getFullYear() : 2026);
  const [viewMonth, setViewMonth] = useState<number>(value.startDate ? value.startDate.getMonth() : 5);

  const nextMonthInfo = useMemo(() => {
    const m = (viewMonth + 1) % 12;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    return { year: y, month: m };
  }, [viewYear, viewMonth]);

  const shiftMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  };

  const handleDayClick = (date: Date) => {
    if (!startDate || (startDate && endDate)) {
      setStartDate(date);
      setEndDate(null);
      return;
    }
    if (stripTime(date) < stripTime(startDate)) {
      setStartDate(date);
      setEndDate(null);
    } else if (isSameDay(date, startDate)) {
      const nextDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      setEndDate(nextDay);
    } else {
      setEndDate(date);
    }
  };

  const toggleFlexMonth = (key: string) => {
    setFlexMonths((prev) =>
      prev.includes(key)
        ? prev.length > 1
          ? prev.filter((k) => k !== key)
          : prev
        : prev.length < 3
        ? [...prev, key]
        : [...prev.slice(1), key]
    );
  };

  const applySelection = () => {
    const draft = {
      mode: tab,
      startDate,
      endDate: startDate && !endDate ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 3) : endDate,
      tolerance,
      flexDuration,
      flexMonths,
    };
    onChange({ ...draft, label: formatSelectionLabel(draft) });
    onClose();
  };

  const renderMonthGrid = (year: number, month: number) => {
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [
      ...Array.from({ length: firstDayOfWeek }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
    ];

    const previewEnd = endDate || (startDate && hoverDate && stripTime(hoverDate) > stripTime(startDate) ? hoverDate : null);

    return (
      <div className="space-y-2.5">
        <div className="text-center text-[13.5px] font-semibold text-[#14191F]">
          {MONTH_NAMES[month]} {year}
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="text-[10.5px] font-medium text-[#8A9097] py-1">
              {wd}
            </div>
          ))}
          {cells.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} className="h-8" />;
            const ts = stripTime(day);
            const isStart = isSameDay(day, startDate);
            const isEnd = isSameDay(day, endDate);
            const isSelectedEdge = isStart || isEnd;
            const inRange =
              startDate &&
              previewEnd &&
              ts > stripTime(startDate) &&
              ts < stripTime(previewEnd);
            const isPreviewEnd = !endDate && previewEnd && isSameDay(day, previewEnd);

            return (
              <button
                key={ts}
                type="button"
                onMouseEnter={() => setHoverDate(day)}
                onMouseLeave={() => setHoverDate(null)}
                onClick={() => handleDayClick(day)}
                className={`h-8 w-full flex items-center justify-center text-[12.5px] font-tabular transition-all cursor-pointer relative ${
                  isSelectedEdge
                    ? 'rounded-full bg-[#0E2034] font-semibold shadow-2xs z-10'
                    : isPreviewEnd
                    ? 'rounded-full border border-[#0E2034] bg-[#ECEAE2] text-[#14191F] font-semibold'
                    : inRange
                    ? 'bg-[#ECEAE2] text-[#14191F]'
                    : 'rounded-full text-[#2C333A] hover:bg-black/[0.06]'
                }`}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const nightsCount =
    startDate && endDate
      ? Math.max(1, Math.round((stripTime(endDate) - stripTime(startDate)) / 86400000))
      : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[1150] bg-black/35 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[650px] max-h-[90dvh] rounded-t-[26px] sm:rounded-[24px] bg-white border border-black/[0.1] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Top Mode Tabs: Exact Dates | Flexible */}
        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-black/[0.06] flex items-center justify-between gap-2">
          <div className="w-7" />
          <div className="inline-flex items-center gap-1 rounded-full bg-[#ECEAE2] p-1">
            <button
              type="button"
              onClick={() => setTab('exact')}
              className={`px-4 py-1.5 rounded-full text-[12.5px] font-medium transition-all cursor-pointer ${
                tab === 'exact' ? 'bg-[#0E2034] shadow-2xs' : 'text-[#5A626A] hover:text-[#14191F]'
              }`}
            >
              Exact dates
            </button>
            <button
              type="button"
              onClick={() => setTab('flexible')}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12.5px] font-medium transition-all cursor-pointer ${
                tab === 'flexible' ? 'bg-[#0E2034] shadow-2xs' : 'text-[#5A626A] hover:text-[#14191F]'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>Flexible</span>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-black/[0.06] flex items-center justify-center text-[#5A626A] cursor-pointer"
            aria-label="Close date picker"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Picker Body */}
        <div className="flex-1 overflow-y-auto thin-scrollbar p-5 space-y-5">
          {tab === 'exact' ? (
            <>
              {/* Quick Presets */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="w-8 h-8 rounded-full border border-black/[0.1] hover:bg-black/[0.04] flex items-center justify-center text-[#14191F] cursor-pointer"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="text-[12px] font-medium text-[#5A626A] text-center">
                  {startDate && endDate ? (
                    <span className="font-tabular font-semibold text-[#14191F]">
                      {MONTH_SHORT[startDate.getMonth()]} {startDate.getDate()} → {MONTH_SHORT[endDate.getMonth()]} {endDate.getDate()} · {nightsCount} {nightsCount === 1 ? 'night' : 'nights'}
                    </span>
                  ) : startDate ? (
                    <span>Now choose your return date</span>
                  ) : (
                    <span>Choose your departure date</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="w-8 h-8 rounded-full border border-black/[0.1] hover:bg-black/[0.04] flex items-center justify-center text-[#14191F] cursor-pointer"
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Dual-Month Calendar on Desktop, Single-Month on Mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>{renderMonthGrid(viewYear, viewMonth)}</div>
                <div className="hidden sm:block">
                  {renderMonthGrid(nextMonthInfo.year, nextMonthInfo.month)}
                </div>
              </div>

              {/* Date Flexibility Tolerance Chips */}
              <div className="flex items-center flex-wrap gap-1.5 pt-2 border-t border-black/[0.06]">
                {[0, 1, 2, 3].map((tol) => (
                  <button
                    key={tol}
                    type="button"
                    onClick={() => setTolerance(tol)}
                    className={`px-3 py-1 rounded-full text-[12px] font-medium border transition-colors cursor-pointer ${
                      tolerance === tol
                        ? 'bg-[#0E2034] border-[#0E2034]'
                        : 'bg-[#FAF9F5] text-[#4A535C] border-black/[0.09] hover:border-black/[0.22]'
                    }`}
                  >
                    {tol === 0 ? 'Exact dates' : `± ${tol} ${tol === 1 ? 'day' : 'days'}`}
                  </button>
                ))}
              </div>
            </>
          ) : (
            /* Flexible Duration + Month Selector */
            <div className="space-y-6">
              <div className="space-y-2.5">
                <div className="text-[12px] font-semibold uppercase tracking-wider text-[#5A626A]">
                  How long would you like to go?
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {FLEX_DURATIONS.map((d) => {
                    const active = flexDuration === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setFlexDuration(d.id)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-[#0E2034] border-[#0E2034] shadow-xs'
                            : 'bg-[#FAF9F5] text-[#14191F] border-black/[0.09] hover:border-black/[0.22]'
                        }`}
                      >
                        <div className="text-[13.5px] font-semibold">{d.label}</div>
                        <div className={`text-[11px] mt-0.5 ${active ? 'opacity-80' : 'text-[#7B828A]'}`}>
                          {d.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-[#5A626A]">
                    When do you want to go?
                  </span>
                  <span className="text-[11.5px] text-[#7B828A]">Pick up to 3 months</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {FLEX_MONTH_CARDS.map((mc) => {
                    const active = flexMonths.includes(mc.key);
                    return (
                      <button
                        key={mc.key}
                        type="button"
                        onClick={() => toggleFlexMonth(mc.key)}
                        className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                          active
                            ? 'bg-[#0E2034] border-[#0E2034] shadow-2xs'
                            : 'bg-[#FAF9F5] text-[#14191F] border-black/[0.08] hover:border-black/[0.22]'
                        }`}
                      >
                        <CalendarIcon className={`w-4 h-4 ${active ? '' : 'text-[#7B828A]'}`} strokeWidth={1.6} />
                        <div className="text-[13px] font-semibold leading-none">{mc.month}</div>
                        <div className={`font-tabular text-[10px] ${active ? 'opacity-80' : 'text-[#7B828A]'}`}>
                          {mc.year}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="shrink-0 px-5 pt-3 pb-safe border-t border-black/[0.07] bg-[#FAF9F5] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setStartDate(null);
              setEndDate(null);
              setTolerance(0);
              setFlexDuration('Weekend');
              setFlexMonths(['Jun 2026']);
            }}
            className="text-[12.5px] font-medium text-[#5A626A] hover:text-[#14191F] underline cursor-pointer"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={applySelection}
            className="px-6 py-2.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[13.5px] font-medium shadow-xs transition-all cursor-pointer"
          >
            Apply dates
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
