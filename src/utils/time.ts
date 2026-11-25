import { TripSavedItem } from '../types/travel';

/**
 * Parses the leading 12-hour start time (e.g. "9:30 AM – 12:30 PM" or "8:00 PM")
 * into minutes since midnight so stops sort chronologically on both Timeline and Map.
 */
export function parseStartTimeMinutes(timeStr?: string): number {
  if (!timeStr) return 24 * 60;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return 24 * 60;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

/**
 * Builds an RFC 5545 `.ics` calendar file string from the user's saved trip items
 * and triggers a browser download.
 */
export function downloadItineraryIcs(tripTitle: string, items: TripSavedItem[]): void {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vesper Travel//EN',
    ...items.map((item, idx) =>
      [
        'BEGIN:VEVENT',
        `UID:vesper-${idx}-${item.id}@vesper.travel`,
        `SUMMARY:${item.title}`,
        `DESCRIPTION:${item.subtitle || 'Planned with Vesper'}`,
        'DTSTART:20260619T140000Z',
        'DTEND:20260619T160000Z',
        'END:VEVENT',
      ].join('\r\n')
    ),
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([lines], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${tripTitle.toLowerCase().replace(/\s+/g, '-')}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
}
