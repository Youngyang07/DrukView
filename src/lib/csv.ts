/** RFC4180 CSV with spreadsheet-formula-injection guard (cells starting with = + - @ get a leading apostrophe). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (head: string[], rows: unknown[][]) => [head.join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n') + '\n';
