import { randomUUID } from 'node:crypto';

export interface TodayTask extends Record<string, unknown> {
  id: string;
  title: string;
  type: string;
  status: string;
  person?: string;
  [key: string]: unknown;
}

export interface TodayView {
  date: string;
  overdue: TodayTask[];
  today: TodayTask[];
  followUps: TodayTask[];
}

export const now = () => new Date().toISOString();
export const uuid = () => randomUUID();

/** 本地日期 YYYY-MM-DD */
export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
