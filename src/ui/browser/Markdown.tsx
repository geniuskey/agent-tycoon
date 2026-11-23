import type { ReactNode } from 'react';

/**
 * 안전한 경량 Markdown 렌더러.
 * HTML을 해석하지 않고 React 요소로만 변환한다 (가상 브라우저 콘텐츠 격리 — 임의 스크립트 실행 불가).
 */

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith('**')) out.push(<strong key={k}>{inline(t.slice(2, -2), i)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) {
      const mm = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      out.push(
        <span key={k} className="text-sky-300 underline decoration-dotted" title={mm[2]}>
          {mm[1]}
        </span>,
      );
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      blocks.push(<pre key={k++}>{buf.join('\n')}</pre>);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const content = inline(h[2], k);
      blocks.push(lvl === 1 ? <h1 key={k++}>{content}</h1> : lvl === 2 ? <h2 key={k++}>{content}</h2> : <h3 key={k++}>{content}</h3>);
      i++;
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={k++} className="overflow-x-auto">
          <table>
            <thead>
              <tr>{head?.map((c, j) => <th key={j}>{inline(c, j)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, j)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={k++}>{buf.map((b, j) => <div key={j}>{inline(b, j)}</div>)}</blockquote>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      // 들여쓰기 2단계까지 지원
      const items: { depth: number; ordered: boolean; text: string }[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/)!;
        items.push({ depth: m[1].length >= 2 ? 1 : 0, ordered: /\d/.test(m[2]), text: m[3] });
        i++;
      }
      const ordered = items[0].ordered;
      const nodes: ReactNode[] = [];
      for (let j = 0; j < items.length; j++) {
        if (items[j].depth > 0) continue;
        const subs: ReactNode[] = [];
        while (j + 1 < items.length && items[j + 1].depth > 0) {
          j++;
          subs.push(<li key={j}>{inline(items[j].text, j)}</li>);
        }
        const idx = nodes.length;
        nodes.push(
          <li key={`${j}-${idx}`}>
            {inline(items[j - subs.length].text, j)}
            {subs.length > 0 && <ul>{subs}</ul>}
          </li>,
        );
      }
      blocks.push(ordered ? <ol key={k++}>{nodes}</ol> : <ul key={k++}>{nodes}</ul>);
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      blocks.push(<hr key={k++} />);
      i++;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#|```|\s*\||>|\s*([-*]|\d+\.)\s)/.test(lines[i])) buf.push(lines[i++]);
    blocks.push(<p key={k++}>{inline(buf.join(' '), k)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
