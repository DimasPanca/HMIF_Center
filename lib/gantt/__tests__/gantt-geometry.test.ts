import { expect, it } from 'vitest';

import { dateSpanWidth, dateToX, xToDate } from '@/lib/gantt/geometry';

function date(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

it('menjalankan golden case geometri melalui filter kontrak T-072', () => {
  const start = date('2026-11-01');
  const end = date('2026-12-07');

  expect(dateToX(end, { start, scale: 'week' })).toBe(216);
  expect(dateSpanWidth(start, end, 'week')).toBe(222);
  expect(dateToX(end, { start, scale: 'month' })).toBe(72);
  expect(dateSpanWidth(start, end, 'month')).toBe(74);
  expect(dateToX(end, { start, scale: 'quarter' })).toBeCloseTo(28.8, 8);
  expect(dateSpanWidth(start, end, 'quarter')).toBeCloseTo(29.6, 8);
  expect(dateSpanWidth(start, start, 'quarter')).toBe(4);
  expect(xToDate(12, date('2026-12-31'), 6)).toEqual(date('2027-01-02'));
});
