/** 터미널 출력용 ANSI 스타일 헬퍼 (엔진은 문자열만 생성, 렌더링은 xterm) */
const wrap = (code: string) => (s: string) => `\x1b[${code}m${s}\x1b[0m`;
export const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  italic: wrap('3'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  gray: wrap('90'),
  white: wrap('97'),
  inv: wrap('7'),
};
export const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

/** 동아시아 문자 폭(2칸)을 고려한 표시 폭 */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) {
    const cp = ch.codePointAt(0)!;
    w += isWide(cp) ? 2 : 1;
  }
  return w;
}
export function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff)
  );
}
export function padEnd(s: string, width: number): string {
  const w = displayWidth(s);
  return w >= width ? s : s + ' '.repeat(width - w);
}
