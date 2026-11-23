/**
 * Agent 실행 로그 (view: "runs") — 사람이 지시하지 않아도 트리거로 실행된 기록.
 * 줄 단위 형식:
 *   meta|<키>|<값>                                  title, agent
 *   run|<id>|<시각>|<ok|held|late|fail|skipped|notrun>|<요약>
 *   call|<run id>|<시각>|<도구 호출>|<ok|denied|approved|blocked|none>
 *   note|<run id>|<info|warn|error>|<내용>
 */

const RUN: Record<string, { label: string; cls: string }> = {
  ok: { label: '정상', cls: 'bg-emerald-500/15 text-emerald-200' },
  held: { label: '보류', cls: 'bg-amber-500/20 text-amber-200' },
  late: { label: '지연', cls: 'bg-amber-500/20 text-amber-200' },
  fail: { label: '사고', cls: 'bg-red-500/20 text-red-200' },
  skipped: { label: '건너뜀', cls: 'bg-red-500/20 text-red-200' },
  notrun: { label: '실행 안 됨', cls: 'border border-line2 text-faint' },
};
const CALL: Record<string, string> = {
  ok: 'text-emerald-300',
  denied: 'text-amber-300',
  approved: 'text-red-300',
  blocked: 'text-dim',
  none: 'text-faint',
};
const CALL_LABEL: Record<string, string> = { ok: '실행', denied: '거절됨', approved: '승인됨', blocked: '허용 도구 아님', none: '' };
const NOTE: Record<string, string> = { info: 'text-dim', warn: 'text-amber-200', error: 'text-red-300' };

export default function RunsView({ content }: { content: string }) {
  const rows = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('|').map((x) => x.trim()));
  const of = (k: string) => rows.filter((r) => r[0] === k).map((r) => r.slice(1));
  const meta = Object.fromEntries(of('meta').map(([k, v]) => [k, v]));
  const runs = of('run');
  const calls = of('call');
  const notes = of('note');
  const bad = runs.filter((r) => ['fail', 'skipped', 'notrun'].includes(r[2])).length;

  return (
    <div className="mx-auto max-w-3xl px-5 py-4">
      <div className="mb-1 text-[11px] text-faint">실행 로그 · {meta.agent ?? ''}</div>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-4">
        <h1 className="text-lg font-semibold text-strong">{meta.title ?? '실행 로그'}</h1>
        <span className={`text-[12px] ${bad ? 'text-red-300' : 'text-emerald-300'}`}>
          {runs.length}회 실행 · 사고 {bad}건
        </span>
      </div>
      {meta.desc && <p className="mb-4 text-[11.5px] text-faint">{meta.desc}</p>}
      <div className="space-y-3">
        {runs.map(([id, at, st, summary]) => {
          const s = RUN[st] ?? { label: st, cls: 'text-dim' };
          return (
            <section key={id} className="rounded-md border border-line">
              <header className="flex flex-wrap items-baseline gap-x-2 border-b border-line/60 px-3 py-1.5">
                <span className="font-mono text-[12.5px] font-semibold text-strong">{id}</span>
                <span className="font-mono text-[11px] text-faint">{at}</span>
                <span className={`rounded px-1.5 py-px text-[10.5px] ${s.cls}`}>{s.label}</span>
                <span className="text-[12px] text-fg">{summary}</span>
              </header>
              <ul className="space-y-0.5 px-3 py-1.5">
                {calls
                  .filter((c) => c[0] === id)
                  .map(([, t, call, res], i) => (
                    <li key={'c' + i} className="flex items-baseline gap-2 text-[11.5px]">
                      <span className="w-10 shrink-0 font-mono text-faint">{t}</span>
                      <span className="min-w-0 font-mono break-all text-fg">{call}</span>
                      {res && res !== 'none' && <span className={`ml-auto shrink-0 ${CALL[res] ?? 'text-dim'}`}>{CALL_LABEL[res] ?? res}</span>}
                    </li>
                  ))}
                {notes
                  .filter((n) => n[0] === id)
                  .map(([, lv, text], i) => (
                    <li key={'n' + i} className={`pl-12 text-[11.5px] ${NOTE[lv] ?? 'text-dim'}`}>
                      ⎿ {text}
                    </li>
                  ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
