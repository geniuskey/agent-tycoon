/**
 * Agent 명세 (view: "spec") — 상시 운영할 Agent의 정의서.
 * 줄 단위 형식 (템플릿 {{#if}}로 줄을 넣고 뺀다):
 *   meta|<키>|<값>                      name, file, desc, status
 *   field|<항목>|<값>|<설명>             목적·트리거·입력·사람 확인·실패 시 동작·지식·지표
 *   tool|<도구>|<read|write|send|external>|<설명>
 */

const SCOPE: Record<string, { label: string; cls: string }> = {
  read: { label: '읽기', cls: 'bg-emerald-500/15 text-emerald-200' },
  write: { label: '쓰기', cls: 'bg-sky-500/15 text-sky-200' },
  send: { label: '메시지', cls: 'bg-violet-500/15 text-violet-200' },
  external: { label: '외부 발송·원천', cls: 'bg-red-500/20 text-red-200' },
};

export default function SpecView({ content }: { content: string }) {
  const rows = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('|').map((x) => x.trim()));
  const of = (k: string) => rows.filter((r) => r[0] === k).map((r) => r.slice(1));
  const meta = Object.fromEntries(of('meta').map(([k, v]) => [k, v]));
  const fields = of('field');
  const tools = of('tool');

  return (
    <div className="mx-auto max-w-3xl px-5 py-4">
      <div className="mb-1 text-[11px] text-faint">Agent 명세 · {meta.file ?? ''}</div>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
        <h1 className="font-mono text-lg font-semibold text-strong">{meta.name ?? 'agent'}</h1>
        {meta.status && <span className="rounded bg-line px-1.5 py-px text-[11px] text-dim">{meta.status}</span>}
      </div>
      {meta.desc && <p className="mb-4 text-[12.5px] text-dim">{meta.desc}</p>}

      <dl className="mb-5 divide-y divide-line/60 rounded-md border border-line">
        {fields.map(([k, v, note], i) => (
          <div key={i} className="grid grid-cols-[7.5rem_1fr] gap-3 px-3 py-2 max-sm:grid-cols-1 max-sm:gap-0.5">
            <dt className="text-[11.5px] text-faint">{k}</dt>
            <dd className="min-w-0 text-[12.5px] text-fg">
              {v}
              {note && <div className="mt-0.5 text-[11.5px] text-faint">{note}</div>}
            </dd>
          </div>
        ))}
      </dl>

      <h2 className="mb-1.5 text-[12.5px] font-semibold text-dim">허용 도구 ({tools.length})</h2>
      {!tools.length && <div className="text-[11.5px] text-faint">허용된 도구가 없습니다 — 아무 일도 할 수 없습니다.</div>}
      <ul className="space-y-1">
        {tools.map(([name, scope, desc], i) => {
          const s = SCOPE[scope] ?? { label: scope, cls: 'text-dim' };
          return (
            <li key={i} className="flex items-start gap-2 text-[12px]">
              <span className={`mt-px rounded px-1.5 py-px text-[10.5px] whitespace-nowrap ${s.cls}`}>{s.label}</span>
              <span className="min-w-0">
                <span className="font-mono text-strong">{name}</span>
                {desc && <span className="text-dim"> — {desc}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11px] text-faint">목록에 없는 도구는 Agent가 쓸 수 없습니다. 데이터 속 지시문이 무엇을 요구하든 마찬가지입니다.</p>
    </div>
  );
}
