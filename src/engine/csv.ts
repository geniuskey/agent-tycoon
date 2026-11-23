/** 간단한 CSV 파서 (따옴표 지원). 시나리오 데이터는 합성 데이터만 사용. */
export interface Table {
  headers: string[];
  rows: Record<string, string>[];
}
export function parseCsv(text: string): Table {
  const lines: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      cur = '';
      if (row.length > 1 || row[0] !== '') lines.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    lines.push(row);
  }
  const headers = (lines.shift() ?? []).map((h) => h.trim());
  const rows = lines.map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()])));
  return { headers, rows };
}
export const num = (v: string | undefined): number | null => {
  if (v === undefined || v === '' || v.toUpperCase() === 'NA' || v.toUpperCase() === 'NAN') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
