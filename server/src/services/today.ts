import { db } from '../db/connection.js';
import { localDate, type TodayView } from '../routes/helpers.js';

/**
 * 今日视图统一查询（M10 去重重构）：
 * 原先在 routes/tasks.ts、routes/report.ts、scheduler/index.ts 重复三份，现统一到此。
 * - overdue/today：子任务 + 平铺想法（tasks 表，JOIN projects 带 project_name）
 * - followUps：follow 型**项目**（projects JOIN follow_ups，项目级）
 *   为兼容前端/LLM 报表对 title 字段的使用，select 里带 p.name AS title
 */
export function getTodayView(): TodayView {
  const today = localDate();
  const active = "t.status IN ('todo','doing')";
  const overdue = db.prepare(
    `SELECT t.*, p.name AS project_name
     FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
     WHERE ${active} AND t.ddl IS NOT NULL AND substr(t.ddl,1,10) < ? ORDER BY t.ddl`,
  ).all(today) as TodayView['overdue'];
  const todayTasks = db.prepare(
    `SELECT t.*, p.name AS project_name
     FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
     WHERE (${active} AND substr(t.ddl,1,10) = ?)
        OR (t.status = 'done' AND substr(t.done_at,1,10) = ?)
     ORDER BY t.priority, t.ddl`,
  ).all(today, today) as TodayView['today'];
  const followUps = db.prepare(
    `SELECT p.*, p.name AS title, f.person, f.next_follow_date, f.urge_count, f.last_urged_at
     FROM projects p JOIN follow_ups f ON f.task_id = p.id
     WHERE p.status IN ('todo','doing') AND p.type = 'follow' AND f.next_follow_date <= ?
     ORDER BY f.next_follow_date`,
  ).all(today) as TodayView['followUps'];
  return { date: today, overdue, today: todayTasks, followUps };
}
