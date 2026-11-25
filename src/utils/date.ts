export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Returns current local datetime formatted for <input type="datetime-local">: YYYY-MM-DDTHH:mm */
export function getNowDateTimeLocal(date = new Date()): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

/** Returns current local date as YYYY-MM-DD */
export function getTodayDateStr(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Returns current local time as HH:mm */
export function getNowTimeStr(date = new Date()): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatDateTimeLabel(dt: string): string {
  if (!dt) return '';
  const [datePart, timePart] = dt.split('T');
  if (!timePart) return datePart;
  return `${datePart} ${timePart.slice(0, 5)}`;
}

export function formatDateOnly(dt: string): string {
  if (!dt) return '';
  return dt.split('T')[0];
}

export function getMonthKey(dt: string): string {
  const datePart = formatDateOnly(dt);
  return datePart.slice(0, 7); // YYYY-MM
}

export function getYearMonthLabel(ym: string): string {
  const [year, month] = ym.split('-');
  return `${year} 年 ${Number(month)} 月`;
}

export function isFutureDateTime(dt: string): boolean {
  if (!dt) return false;
  return dt > getNowDateTimeLocal();
}

export function getDaysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function getFirstWeekdayOfMonth(year: number, monthIndex0: number): number {
  // 0 = Sunday ... 6 = Saturday
  return new Date(year, monthIndex0, 1).getDay();
}
