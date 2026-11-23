/**
 * 종이 문서 스캔본 뷰어 (가상). JSON으로 정의된 손글씨 양식을 종이처럼 렌더링한다.
 * 플레이어는 이 화면과 OCR 결과(CSV)를 직접 대조해 오류를 찾을 수 있다.
 */
type Cell = string | { v: string; crossed?: string; smudge?: boolean; ambiguous?: boolean; hint?: string };

interface ScanDef {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: Cell[][];
  footer?: string;
  note?: string;
}

const HAND = "'Nanum Pen Script', 'Nanum Brush Script', 'Gaegu', 'Comic Sans MS', 'Bradley Hand', cursive";

function jitter(i: number, j: number) {
  const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

export default function ScanView({ content }: { content: string }) {
  let def: ScanDef;
  try {
    def = JSON.parse(content);
  } catch {
    return <div className="p-6 text-xs text-red-300">스캔 파일을 열 수 없습니다.</div>;
  }
  return (
    <div className="flex min-w-0 justify-center bg-[#26282b] p-4">
      <div
        className="relative w-full max-w-3xl rounded-sm px-6 py-5 shadow-2xl"
        style={{ background: 'linear-gradient(180deg,#f3efe4,#ebe5d6)', color: '#2b2b2b', transform: 'rotate(-0.4deg)' }}
      >
        <div className="mb-1 flex items-end justify-between border-b-2 border-[#555] pb-1">
          <div>
            <div className="text-[15px] font-bold tracking-tight">{def.title}</div>
            {def.subtitle && <div className="text-[11px] text-[#555]">{def.subtitle}</div>}
          </div>
          <div className="text-[10px] text-[#777]">Nova Semiconductor · 가상</div>
        </div>
        <div className="overflow-x-auto">
        <table className="mt-2 w-full border-collapse text-[11.5px]">
          <thead>
            <tr>
              {def.columns.map((c) => (
                <th key={c} className="border border-[#777] bg-[#e2dccb] px-1.5 py-1 text-left font-semibold whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {def.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => {
                  const c = typeof cell === 'string' ? { v: cell } : cell;
                  const printed = j === 0;
                  const rot = (jitter(i, j) - 0.5) * 4;
                  const ink = (c.v === 'X' || c.v === 'NG') && !printed ? '#b3261e' : '#1d3a8a';
                  return (
                    <td key={j} className="h-8 border border-[#999] px-1.5 align-middle whitespace-nowrap" title={c.hint}>
                      {printed ? (
                        <span className="text-[11px] text-[#555]">{c.v}</span>
                      ) : (
                        <span className="relative inline-flex items-center gap-1.5">
                          {c.crossed && (
                            <span style={{ fontFamily: HAND, color: '#1d3a8a', fontSize: 17, textDecoration: 'line-through', textDecorationThickness: 2 }}>
                              {c.crossed}
                            </span>
                          )}
                          <span
                            style={{
                              fontFamily: HAND,
                              color: ink,
                              fontSize: 17,
                              display: 'inline-block',
                              transform: `rotate(${rot}deg)`,
                              filter: c.smudge ? 'blur(1.6px)' : c.ambiguous ? 'blur(0.5px)' : undefined,
                              opacity: c.smudge ? 0.8 : 1,
                            }}
                          >
                            {c.v}
                          </span>
                          {c.smudge && <span className="absolute -inset-1 rounded-full bg-[#8a7d5a]/25 blur-sm" />}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {def.footer && <div className="mt-3 text-right text-[12px]" style={{ fontFamily: HAND, color: '#1d3a8a', fontSize: 18 }}>{def.footer}</div>}
        {def.note && <div className="mt-2 text-[10px] text-[#777]">{def.note}</div>}
      </div>
    </div>
  );
}
