import { useMemo, useState } from 'react';
import { CAMPAIGNS, CATALOG, DOMAINS, FUNCTIONS, SCENARIOS, TASK_TYPES, missionsOf } from '../scenarios';
import type { CarryState, LoadedScenario } from '../engine/types';
import { useSession } from '../store/session';
import { deleteSession, exportSession, type SessionRecord } from '../store/persist';
import { activeFoundation, carriedTrust, formatSimTime } from '../engine/engine';
import { Btn } from './common';
import { BriefingBody } from './Briefing';

export default function Home() {
  const sessions = useSession((s) => s.sessions);
  const { start, resume, showFeedback, refreshSessions } = useSession.getState();
  const [domain, setDomain] = useState('');
  const [fn, setFn] = useState('');
  const [type, setType] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [selCarry, setSelCarry] = useState<{ carry?: CarryState; label?: string }>({});
  const [seed, setSeed] = useState(() => String(1000 + (Date.now() % 9000)));

  const all = useMemo(
    () => [
      ...SCENARIOS.filter((s) => !s.campaign).map((s) => ({ id: s.id, domain: s.domain, function: s.function, taskType: s.taskType, title: s.title, summary: s.briefing.goal, ready: true, difficulty: s.difficulty, est: s.estMinutes })),
      ...CATALOG.map((c) => ({ ...c, ready: false, difficulty: 0, est: 0 })),
    ],
    [],
  );
  const shown = all.filter((s) => (!domain || s.domain === domain) && (!fn || s.function === fn) && (!type || s.taskType === type));
  const sel = SCENARIOS.find((s) => s.id === selected);
  /** 이 미션의 제출 안 한 기록 (가장 최근) — 있으면 '업무 시작' 대신 이어한다 */
  const ongoing = sel ? sessions.find((r) => r.scenarioId === sel.id && !r.submitted) : undefined;
  const restart = async () => {
    if (!sel) return;
    if (ongoing && !confirm('진행 중인 기록을 지우고 처음부터 다시 시작할까요?')) return;
    for (const r of sessions.filter((x) => x.scenarioId === sel.id && !x.submitted)) await deleteSession(r.id);
    start(sel.id, Number(seed) || 1, selCarry.carry);
  };
  /** 캠페인에서 가장 멀리 간 제출 기록 — 자유 플레이 미션의 사내 공통 지침이 된다 */
  const orgCarry = useMemo(() => {
    const stageOf = (id: string) => SCENARIOS.find((s) => s.id === id)?.campaign?.stage ?? -1;
    const recs = sessions.filter((r) => r.submitted && r.exportCarry && stageOf(r.scenarioId) >= 0);
    recs.sort((a, b) => stageOf(b.scenarioId) - stageOf(a.scenarioId) || b.updatedAt - a.updatedAt);
    return recs[0] ? { carry: recs[0].exportCarry!, stage: stageOf(recs[0].scenarioId) } : undefined;
  }, [sessions]);
  const pickFreeplay = (id: string) => {
    const s = SCENARIOS.find((x) => x.id === id);
    if (s?.foundation && orgCarry) {
      const n = activeFoundation(s, orgCarry.carry).length;
      setSelCarry({ carry: orgCarry.carry, label: `캠페인 ${orgCarry.stage}단계까지의 결과 — 사내 공통 지침 원칙 ${n}/${s.foundation.length}개 (/org/AGENTS.md)` });
    } else setSelCarry({});
    setSelected(id);
  };
  const usedDomains = [...new Set(all.map((s) => s.domain))];
  const usedFns = [...new Set(all.map((s) => s.function))];
  const usedTypes = [...new Set(all.map((s) => s.taskType))];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
        <span className="font-mono text-[13px] font-semibold text-fg">
          <span className="text-sky-400">&gt;_</span> Agent Tycoon
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-8 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-strong">AI가 일할 수 있는 조직을 만든다</h1>
            <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-dim">
              현실의 출발점은 'AI Agent 여러 개를 지휘하는 것'이 아니라 종이·엑셀·메일·사람 머릿속에 흩어진 데이터입니다.
              현황 파악 → 디지털화 → 표준화 → 데이터 기반 → 지식화 → Agent 활용 → 오케스트레이션까지, 한 가상 조직을 단계별로 키워가며
              사람과 협의하고 AI를 검증하는 법을 체험합니다. 실제 AI API는 호출하지 않으며 모든 인물·데이터는 가상입니다.
            </p>
          </div>
        </header>

        {sessions.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 text-[13px] font-semibold text-fg">작업 이력</h2>
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

        {CAMPAIGNS.map((c) => (
          <CampaignSection
            key={c.id}
            campaignId={c.id}
            sessions={sessions}
            onPick={(id, carry, label) => {
              setSelCarry({ carry, label });
              setSelected(id);
            }}
          />
        ))}

        <section>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="mr-2 text-lg font-semibold text-strong">자유 플레이 · 멀티 Agent 오케스트레이션</h2>
            <span className="font-mono text-[11px] text-sky-300">STAGE 7</span>
          </div>
          <p className="mb-4 max-w-3xl text-[13px] leading-relaxed text-dim">데이터·표준·지식 기반이 갖춰진 조직의 고급 미션입니다. 언제든 플레이할 수 있고, 캠페인을 진행했다면 그 결과가 사내 공통 지침이 되어 Agent가 추천에 활용합니다.</p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Filter label="제품 영역" value={domain} onChange={setDomain} options={usedDomains.map((d) => [d, DOMAINS[d] ?? d])} />
            <Filter label="직무" value={fn} onChange={setFn} options={usedFns.map((d) => [d, FUNCTIONS[d] ?? d])} />
            <Filter label="업무 유형" value={type} onChange={setType} options={usedTypes.map((d) => [d, TASK_TYPES[d] ?? d])} />
            <span className="ml-auto text-[11px] text-faint">
              플레이 가능 {SCENARIOS.filter((s) => !s.campaign).length} · 준비 중 {CATALOG.length}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {shown.map((s) => (
              <button
                key={s.id}
                disabled={!s.ready}
                onClick={() => pickFreeplay(s.id)}
                className={`rounded-lg border text-left transition-colors ${
                  s.ready ? 'border-line2 bg-panel p-4 hover:border-sky-600 hover:bg-panel2' : 'cursor-not-allowed border-dashed border-line px-4 py-3'
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
                <div className={`mb-1 ${s.ready ? 'text-[14px] font-semibold text-strong' : 'text-[13px] text-dim'}`}>{s.title}</div>
                <div className={`line-clamp-2 leading-relaxed ${s.ready ? 'text-[12.5px] text-dim' : 'text-[11.5px] text-faint'}`}>{s.summary}</div>
              </button>
            ))}
          </div>
        </section>
      </div>
      </div>

      {sel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setSelected(null)}>
          <div className="max-h-full w-full max-w-3xl overflow-auto rounded-lg border border-line2 bg-panel p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-xl font-semibold text-strong">{sel.title}</h2>
              <Btn onClick={() => setSelected(null)}>✕</Btn>
            </div>
            <BriefingBody s={sel} />
            {sel.foundation && !sel.campaign && (
              <div className="mt-4 rounded-md border border-line bg-bg px-3 py-2 text-[12px] text-dim">
                <span className="font-semibold text-fg">사내 공통 지침: </span>
                {selCarry.label ?? '없음 — 캠페인을 진행하면 수율팀에서 정착한 원칙이 사내 지침(AGENTS.md)이 되어 이 미션의 Agent가 추천에 활용합니다.'}
                {selCarry.carry && (
                  <ul className="mt-1 list-disc pl-4 text-[11px] text-faint">
                    {sel.foundation.map((r) => {
                      const on = activeFoundation(sel, selCarry.carry).some((x) => x.id === r.id);
                      return (
                        <li key={r.id} className={on ? 'text-emerald-300/90' : 'line-through opacity-60'}>
                          {r.text} <span className="text-faint">({r.from}{on ? '' : ' — 캠페인에서 만들지 못함'})</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
            {sel.campaign && (
              <div className="mt-4 rounded-md border border-line bg-bg px-3 py-2 text-[12px] text-dim">
                <span className="font-semibold text-fg">이어받는 상태: </span>
                {selCarry.label ?? '없음 (캠페인 첫 미션)'}
                {selCarry.carry && (sel.people ?? []).some((p) => selCarry.carry!.trust[p.id] !== undefined) && (
                  <div className="mt-1 text-[11px] text-faint">
                    신뢰도 —{' '}
                    {(sel.people ?? [])
                      .filter((p) => selCarry.carry!.trust[p.id] !== undefined)
                      .map((p) => {
                        const v = selCarry.carry!.trust[p.id];
                        const eff = selCarry.carry!.from?.length ? carriedTrust(p.trust, v) : v;
                        return `${p.name} ${eff}${eff !== v ? ` (지난 단계 ${v})` : ''}`;
                      })
                      .join(' · ')}
                    <div className="mt-0.5">새 과제는 새 부탁입니다 — 쌓은 신뢰는 절반만 이어지고, 잃은 신뢰는 그대로 남습니다.</div>
                  </div>
                )}
              </div>
            )}
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
              {ongoing ? (
                <>
                  <Btn className="ml-auto" onClick={restart} title="진행 중인 기록을 지우고 새로 시작">
                    처음부터 다시
                  </Btn>
                  <Btn variant="primary" className="px-4 py-1.5" onClick={() => resume(ongoing)} title={`가상 ${formatSimTime(ongoing.tick)} · ${new Date(ongoing.updatedAt).toLocaleString()}`}>
                    이어하기 →
                  </Btn>
                </>
              ) : (
                <Btn variant="primary" className="ml-auto px-4 py-1.5" onClick={restart}>
                  업무 시작 →
                </Btn>
              )}
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

function CampaignSection({
  campaignId,
  sessions,
  onPick,
}: {
  campaignId: string;
  sessions: SessionRecord[];
  onPick: (scenarioId: string, carry: CarryState | undefined, label: string | undefined) => void;
}) {
  const c = CAMPAIGNS.find((x) => x.id === campaignId)!;
  const doneRec = (id: string) => sessions.find((r) => r.scenarioId === id && r.submitted);
  const carryFor = (s: LoadedScenario): { carry?: CarryState; label?: string; locked: boolean } => {
    const req = s.campaign?.requires ?? [];
    if (!req.length) return { locked: false };
    const prev = doneRec(req[req.length - 1]);
    if (prev?.exportCarry) {
      const found = Object.keys(prev.exportCarry.flags).filter((k) => k.startsWith('found.') && prev.exportCarry!.flags[k]).length;
      return { carry: prev.exportCarry, label: `이전 미션 결과 (${new Date(prev.updatedAt).toLocaleDateString()}) — 파악한 사항 ${found}개, 산출물 ${Object.keys(prev.exportCarry.files).length}개`, locked: false };
    }
    return { carry: s.campaign?.defaultCarry, label: '이전 단계 미완료 — 기본 상태로 시작', locked: true };
  };
  return (
    <section className="mb-10">
      <div className="mb-1 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-strong">캠페인 · {c.title}</h2>
        <span className="text-[11px] text-faint">{c.company}</span>
      </div>
      <p className="mb-4 max-w-3xl text-[13px] leading-relaxed text-dim">{c.summary}</p>
      <ol className="overflow-hidden rounded-lg border border-line bg-panel">
        {c.stages.map((st) => {
          const missions = st.freeplay ? [] : missionsOf(c.id, st.stage);
          const ready = st.status === 'ready';
          return (
            <li key={st.stage} className="flex gap-3 border-t border-line px-4 py-3 first:border-t-0">
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  missions.length && missions.every((m) => doneRec(m.id)) ? 'bg-emerald-400' : ready ? 'bg-accent' : 'border border-line2'
                }`}
              />
              <div className={`min-w-0 flex-1 ${ready ? '' : 'flex flex-wrap items-baseline gap-x-3'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-mono text-[11px] ${ready ? 'text-dim' : 'text-faint'}`}>STAGE {st.stage}</span>
                  <span className={ready ? 'text-[14px] font-semibold text-strong' : 'text-[13px] text-dim'}>{st.title}</span>
                  <span className={`rounded px-1.5 py-px text-[10.5px] ${ready ? 'bg-line text-dim' : 'text-faint'}`}>플레이어: {st.role}</span>
                  {!ready && <span className="rounded border border-line px-1.5 text-[10px] text-faint">준비 중</span>}
                  {st.freeplay && <span className="text-[10.5px] text-sky-300">아래 자유 플레이 ↓</span>}
                </div>
                <div className={ready ? 'mt-0.5 text-[12.5px] text-dim' : 'text-[11.5px] text-faint'}>{st.summary}</div>
                {missions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {missions.map((m) => {
                      const done = doneRec(m.id);
                      const going = sessions.some((r) => r.scenarioId === m.id && !r.submitted);
                      const cf = carryFor(m);
                      return (
                        <button
                          key={m.id}
                          onClick={() => onPick(m.id, cf.carry, cf.label)}
                          className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-left ${
                            done
                              ? 'border-emerald-700/60 bg-emerald-500/[0.06] hover:border-emerald-500'
                              : cf.locked
                                ? 'border-line2 bg-bg hover:border-line2 hover:bg-panel2'
                                : 'border-accent bg-accent/15 hover:bg-accent/25'
                          }`}
                        >
                          <span className={`text-xs ${done ? 'text-emerald-300' : cf.locked ? 'text-faint' : 'text-sky-300'}`}>{done ? '✔' : cf.locked ? '◌' : '▶'}</span>
                          <span className={`text-[12.5px] ${cf.locked && !done ? 'text-dim' : 'font-medium text-strong'}`}>{m.title.replace(/^\d단계 · /, '')}</span>
                          <span className="text-[10.5px] text-faint">
                            {going ? '진행 중 · 이어하기' : done ? '완료 · 다시 하기' : cf.locked ? '이전 단계 먼저 (기본값으로 시작 가능)' : `약 ${m.estMinutes}분`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
