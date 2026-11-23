/**
 * 지식 시험 결과 (view: "eval") — Agent가 지식 패키지만 읽고 푼 문항별 결과.
 * 줄 단위 형식 (템플릿 {{#if}}로 바꾼다):
 *   meta|<키>|<값>              title, subject, run
 *   q|<번호>|<문항>|<pass|fail>|<AI 답>|<실패 원인>
 */
export default function EvalView({ content }: { content: string }) {
  const rows = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('|').map((x) => x.trim()));
  const meta = Object.fromEntries(rows.filter((r) => r[0] === 'meta').map((r) => [r[1], r[2]]));
  const qs = rows.filter((r) => r[0] === 'q').map((r) => r.slice(1));
  const passed = qs.filter((q) => q[2] === 'pass').length;
  const all = passed === qs.length && qs.length > 0;

  return (
    <div className="mx-auto max-w-3xl px-5 py-4">
      <div className="mb-1 text-[11px] text-faint">지식 시험 (eval) · {meta.subject ?? ''}</div>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-4">
        <h1 className="text-lg font-semibold text-strong">{meta.title ?? '지식 시험'}</h1>
        <span className={`font-mono text-[15px] font-semibold ${all ? 'text-emerald-300' : 'text-amber-300'}`}>
          {passed}/{qs.length} 통과
        </span>
        {meta.run && <span className="text-[11.5px] text-dim">{meta.run}</span>}
      </div>
      <p className="mb-4 text-[11.5px] text-faint">Agent가 지식 패키지만 읽고 답했습니다. 실패한 문항은 원인을 보고 지식을 고친 뒤 다시 시험하세요.</p>
      <ol className="space-y-2">
        {qs.map(([n, question, st, answer, cause]) => {
          const ok = st === 'pass';
          return (
            <li key={n} className={`rounded-md border px-3 py-2 ${ok ? 'border-line' : 'border-amber-700/60 bg-amber-500/[0.05]'}`}>
              <div className="flex items-start gap-2">
                <span className={`mt-px rounded px-1.5 py-px text-[10.5px] whitespace-nowrap ${ok ? 'bg-emerald-500/15 text-emerald-200' : 'bg-red-500/20 text-red-200'}`}>
                  {ok ? '통과' : '실패'}
                </span>
                <span className="text-[12.5px] font-medium text-strong">
                  {n}. {question}
                </span>
              </div>
              {answer && <div className="mt-1 pl-[46px] text-[12px] leading-relaxed text-fg">“{answer}”</div>}
              {!ok && cause && <div className="mt-1 pl-[46px] text-[11.5px] text-amber-200">원인: {cause}</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
