import { useMemo, useState } from 'react';
import { CATALOG, DOMAINS, FUNCTIONS, SCENARIOS, TASK_TYPES } from '../scenarios';
import { useSession } from '../store/session';
import { deleteSession, exportSession, type SessionRecord } from '../store/persist';
import { formatSimTime } from '../engine/engine';
import { Btn, SimBadge } from './common';
import { BriefingBody } from './Briefing';

export default function Home() {
  const sessions = useSession((s) => s.sessions);
  const { start, resume, showFeedback, refreshSessions } = useSession.getState();
  const [domain, setDomain] = useState('');
  const [fn, setFn] = useState('');
  const [type, setType] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => String(1000 + (Date.now() % 9000)));

  const all = useMemo(
    () => [
      ...SCENARIOS.map((s) => ({ id: s.id, domain: s.domain, function: s.function, taskType: s.taskType, title: s.title, summary: s.briefing.goal, ready: true, difficulty: s.difficulty, est: s.estMinutes })),
      ...CATALOG.map((c) => ({ ...c, ready: false, difficulty: 0, est: 0 })),
    ],
    [],
  );
  const shown = all.filter((s) => (!domain || s.domain === domain) && (!fn || s.function === fn) && (!type || s.taskType === type));
  const sel = SCENARIOS.find((s) => s.id === selected);
  const usedDomains = [...new Set(all.map((s) => s.domain))];
  const usedFns = [...new Set(all.map((s) => s.function))];
  const usedTypes = [...new Set(all.map((s) => s.taskType))];

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-8 flex items-start justify-between gap-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-lg font-bold text-sky-300">&gt;_ Agent Tycoon</span>
              <SimBadge />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-50">Don&apos;t do the work. Orchestrate it.</h1>
            <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-dim">
              가상의 반도체 기업에서 업무를 받고, 여러 AI Agent를 CLI로 생성·지휘·검증하며 업무를 완수하는 시뮬레이터입니다. 실제 AI API는 호출하지 않으며,
              모든 Agent 행동과 데이터는 시나리오 기반 시뮬레이션과 합성 데이터입니다.
            </p>
          </div>
        </header>

        {sessions.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 text-xs font-semibold tracking-wider text-faint uppercase">작업 이력</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {sessions.slice(0, 6).map((r) => (
                <SessionRow key={r.id} r={r} onResume={() => resume(r)} onReview={() => showFeedback(r)} onDelete={async () => {
                  await deleteSession(r.id);
                  await refreshSessions();
                }} />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-2 text-xs font-semibold tracking-wider text-faint uppercase">시나리오</h2>
            <Filter label="제품 영역" value={domain} onChange={setDomain} options={usedDomains.map((d) => [d, DOMAINS[d] ?? d])} />
            <Filter label="직무" value={fn} onChange={setFn} options={usedFns.map((d) => [d, FUNCTIONS[d] ?? d])} />
            <Filter label="업무 유형" value={type} onChange={setType} options={usedTypes.map((d) => [d, TASK_TYPES[d] ?? d])} />
            <span className="ml-auto text-[11px] text-faint">
              플레이 가능 {SCENARIOS.length} · 준비 중 {CATALOG.length}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {shown.map((s) => (
              <button
                key={s.id}
                disabled={!s.ready}
                onClick={() => setSelected(s.id)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  s.ready ? 'border-line2 bg-panel hover:border-sky-700' : 'cursor-not-allowed border-line/70 bg-panel/40'
                } ${selected === s.id ? 'border-sky-600' : ''}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                  <span className={`rounded px-1.5 py-0.5 ${s.ready ? 'bg-sky-500/15 text-sky-300' : 'bg-line text-faint'}`}>{DOMAINS[s.domain] ?? s.domain}</span>
                  <span className="rounded bg-line px-1.5 py-0.5 text-dim">{TASK_TYPES[s.taskType] ?? s.taskType}</span>
                  {s.ready ? (
                    <span className="ml-auto text-faint">
                      {'●'.repeat(s.difficulty)}
                      {'○'.repeat(3 - s.difficulty)} · {s.est}분
                    </span>
                  ) : (
                    <span className="ml-auto text-faint">준비 중</span>
                  )}
                </div>
                <div className={`mb-1 text-[14px] font-medium ${s.ready ? 'text-slate-100' : 'text-faint'}`}>{s.title}</div>
                <div className={`line-clamp-2 text-xs leading-relaxed ${s.ready ? 'text-dim' : 'text-faint'}`}>{s.summary}</div>
              </button>
            ))}
          </div>
        </section>
      </div>

      {sel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setSelected(null)}>
          <div className="max-h-full w-full max-w-3xl overflow-auto rounded-lg border border-line2 bg-panel p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-xl font-semibold text-slate-100">{sel.title}</h2>
              <Btn onClick={() => setSelected(null)}>✕</Btn>
            </div>
            <BriefingBody s={sel} />
            <div className="mt-6 flex items-center gap-3 border-t border-line pt-4">
              <label className="flex items-center gap-2 text-xs text-dim" title="같은 시드와 같은 명령 순서는 항상 같은 결과를 만듭니다">
                난수 시드
                <input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  className="w-24 rounded border border-line2 bg-bg px-2 py-1 font-mono text-xs outline-none focus:border-sky-700"
                />
              </label>
              <span className="text-[11px] text-faint">동일 시드 + 동일 명령 = 동일 결과</span>
              <Btn variant="primary" className="ml-auto px-4 py-1.5" onClick={() => start(sel.id, Number(seed) || 1)}>
                업무 시작 →
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-line2 bg-panel px-2 py-1 text-xs text-fg outline-none focus:border-sky-700"
    >
      <option value="">{label}: 전체</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function SessionRow({ r, onResume, onReview, onDelete }: { r: SessionRecord; onResume: () => void; onReview: () => void; onDelete: () => void }) {
  const download = () => {
    const blob = new Blob([exportSession(r)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `agent-tycoon-${r.scenarioId}-${r.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-panel px-3 py-2">
      <span className={`h-2 w-2 rounded-full ${r.submitted ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-fg">{r.scenarioTitle}</div>
        <div className="text-[11px] text-faint">
          {new Date(r.updatedAt).toLocaleString()} · 가상 {formatSimTime(r.tick)} · 명령 {r.commands.filter((c) => c.kind === 'input').length}개 · seed {r.seed}
        </div>
      </div>
      {r.submitted ? (
        <Btn variant="outline" onClick={onReview}>
          피드백·복기
        </Btn>
      ) : (
        <Btn variant="outline" onClick={onResume}>
          이어하기
        </Btn>
      )}
      <Btn onClick={download} title="세션 기록 내보내기 (JSON)">
        ⤓
      </Btn>
      <Btn onClick={onDelete} title="삭제">
        ✕
      </Btn>
    </div>
  );
}
