import { useMemo, useState } from 'react';
import { evaluate, type Rating } from '../engine/evaluate';
import { exportCarry, formatSimTime, replay } from '../engine/engine';
import { SCENARIOS } from '../scenarios';
import { useSession } from '../store/session';
import { AgentAvatar, Btn, SimBadge, StatusBadge, TASK_STATUS, agentColor, useSim } from './common';
import { EventLog, Gantt } from './Timeline';

const RATING: Record<Rating, { label: string; cls: string; icon: string }> = {
  good: { label: '잘함', cls: 'border-emerald-800 text-emerald-300 bg-emerald-500/10', icon: '✔' },
  fair: { label: '보통', cls: 'border-amber-800 text-amber-300 bg-amber-500/10', icon: '◐' },
  poor: { label: '개선 필요', cls: 'border-red-900 text-red-300 bg-red-500/10', icon: '✗' },
  na: { label: '해당 없음', cls: 'border-line2 text-faint', icon: '–' },
};

export default function Feedback() {
  const sim = useSim()!;
  const { goHome, start } = useSession.getState();
  const fb = useMemo(() => evaluate(sim), [sim]);
  const [tab, setTab] = useState<'feedback' | 'replay'>('feedback');
  const okCount = fb.outcomes.filter((o) => o.success).length;
  const next = sim.scenario.campaign ? SCENARIOS.find((x) => x.campaign?.requires?.includes(sim.scenario.id)) : undefined;
  const carryOut = useMemo(() => (sim.scenario.campaign ? exportCarry(sim) : undefined), [sim]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <span className="font-mono text-sm font-bold text-sky-300">&gt;_ Agent Tycoon</span>
        <SimBadge />
        <span className="text-[13px] text-fg">{sim.scenario.title}</span>
        <div className="ml-4 flex gap-1">
          <button onClick={() => setTab('feedback')} className={`rounded px-3 py-1 text-xs ${tab === 'feedback' ? 'bg-line text-fg' : 'text-dim'}`}>
            학습 피드백
          </button>
          <button onClick={() => setTab('replay')} className={`rounded px-3 py-1 text-xs ${tab === 'replay' ? 'bg-line text-fg' : 'text-dim'}`}>
            작업 이력 복기
          </button>
        </div>
        <div className="ml-auto flex gap-2">
          <Btn variant="outline" onClick={() => start(sim.scenario.id, sim.seed, sim.carry)}>
            같은 시드로 다시
          </Btn>
          <Btn variant="outline" onClick={() => start(sim.scenario.id, (sim.seed * 7 + 13) % 99991, sim.carry)}>
            새 시드로 다시
          </Btn>
          {next && sim.submitted && (
            <Btn variant="primary" onClick={() => start(next.id, sim.seed, carryOut)}>
              다음 단계: {next.title.replace(/^\d단계 · /, '')} →
            </Btn>
          )}
          <Btn variant="primary" onClick={goHome}>
            홈
          </Btn>
        </div>
      </header>

      {tab === 'feedback' ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-5xl px-6 py-6">
            <div className="mb-6 rounded-lg border border-line2 bg-panel p-5">
              <div className="text-[11px] tracking-wider text-faint uppercase">요청자 반응 · {sim.scenario.briefing.requester.name}</div>
              <div className="mt-1 text-xl font-semibold text-strong">{fb.headline}</div>
              <div className="mt-1 text-xs text-dim">
                결과 기준 {okCount}/{fb.outcomes.length} 충족 · 가상 업무 시간 {fb.stats.simMinutes}분 · Agent {fb.stats.agentsSpawned}개 · 최대 동시 작업 {fb.stats.maxConcurrent} ·
                명령 {fb.stats.commands}회 (자연어 {fb.stats.nlInstructions}) · 개입 요청 {fb.stats.gatesOpened}건 · 산출물 확인 {fb.stats.observations}회
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {fb.outcomes.map((o) => (
                  <div key={o.id} className={`rounded-md border px-3 py-2 ${o.success ? 'border-emerald-900 bg-emerald-500/5' : 'border-red-950 bg-red-500/5'}`}>
                    <div className={`text-xs font-semibold ${o.success ? 'text-emerald-300' : 'text-red-300'}`}>
                      {o.success ? '✔' : '✗'} {o.label}
                    </div>
                    <div className="mt-0.5 text-[12px] leading-relaxed text-dim">{o.text}</div>
                  </div>
                ))}
              </div>
            </div>

            {carryOut && (
              <div className="mb-6 rounded-lg border border-sky-900/60 bg-sky-500/5 p-4">
                <div className="mb-1 text-xs font-semibold text-sky-300">다음 단계로 이어지는 것</div>
                <div className="text-[12.5px] leading-relaxed text-dim">
                  이번 미션에서 파악한 사실, 만든 산출물, 사람들과의 관계가 다음 미션의 시작 상태가 됩니다. 여기서 놓친 것은 다음 단계에서 문제로 돌아옵니다.
                </div>
                <div className="mt-2 grid gap-2 text-[12px] md:grid-cols-3">
                  <div>
                    <div className="text-faint">신뢰도</div>
                    {Object.entries(carryOut.trust).map(([k, v]) => (
                      <div key={k} className={v >= 50 ? 'text-emerald-300' : v >= 40 ? 'text-amber-300' : 'text-red-300'}>
                        {sim.personDef(k)?.name ?? k} {v}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-faint">파악한 사항</div>
                    <div className="text-fg">{Object.keys(carryOut.flags).filter((k) => k.startsWith('found.') && carryOut.flags[k]).length}개</div>
                  </div>
                  <div>
                    <div className="text-faint">이어지는 산출물</div>
                    {Object.keys(carryOut.files).map((f) => (
                      <div key={f} className="truncate font-mono text-[11px] text-fg">
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <h2 className="mb-3 text-xs font-semibold tracking-wider text-faint uppercase">역량 피드백</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {fb.dimensions.map((d, i) => {
                const r = RATING[d.rating];
                return (
                  <div key={d.id} className="rounded-lg border border-line bg-panel p-4">
                    <div className="mb-2 flex items-start gap-2">
                      <span className="font-mono text-[11px] text-faint">{i + 1}</span>
                      <div className="flex-1">
                        <div className="text-[13.5px] font-medium text-fg">{d.title}</div>
                        <div className="text-[11.5px] text-faint">{d.question}</div>
                      </div>
                      <span className={`rounded border px-2 py-0.5 text-[11px] ${r.cls}`}>
                        {r.icon} {r.label}
                      </span>
                    </div>
                    {d.findings.length === 0 && <div className="text-[12px] text-faint">이번 진행에서는 평가할 근거가 없었습니다.</div>}
                    <ul className="space-y-1">
                      {d.findings.map((f, j) => (
                        <li key={j} className="flex gap-2 text-[12.5px] leading-relaxed">
                          <span className={f.kind === 'positive' ? 'text-emerald-400' : 'text-amber-400'}>{f.kind === 'positive' ? '+' : '!'}</span>
                          <span className="text-fg/90">{f.text}</span>
                        </li>
                      ))}
                    </ul>
                    {d.suggestions.length > 0 && (
                      <div className="mt-2 rounded border border-sky-900/60 bg-sky-500/5 px-2.5 py-1.5">
                        {d.suggestions.map((s, j) => (
                          <div key={j} className="text-[12px] leading-relaxed text-sky-200/90">
                            → {s}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <h2 className="mt-8 mb-2 text-xs font-semibold tracking-wider text-faint uppercase">학습 목표</h2>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-dim">
              {sim.scenario.learningObjectives.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <Replay />
      )}
    </div>
  );
}

/** 작업 이력 복기: 결정적 재생으로 임의 시점의 상태를 재구성 */
function Replay() {
  const sim = useSim()!;
  const [t, setT] = useState(sim.tick);
  const snap = useMemo(() => (t === sim.tick ? sim : replay(sim.scenario, sim.seed, sim.commands, t)), [t, sim]);
  const decisions = sim.events.filter((e) => e.type === 'command' || e.type === 'gate.resolved');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2">
        <span className="w-14 font-mono text-sm text-fg">{formatSimTime(t)}</span>
        <input type="range" min={0} max={sim.tick} value={t} onChange={(e) => setT(Number(e.target.value))} className="flex-1 accent-sky-500" />
        <Btn variant="outline" onClick={() => setT(Math.max(0, t - 5))}>
          −5분
        </Btn>
        <Btn variant="outline" onClick={() => setT(Math.min(sim.tick, t + 5))}>
          +5분
        </Btn>
        <span className="text-[11px] text-faint">결정적 재생: seed {sim.seed} · 명령 {sim.commands.length}개</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-0">
        <div className="col-span-4 min-h-0 overflow-auto border-r border-line">
          <div className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-faint uppercase">플레이어 판단 기록</div>
          {decisions.map((e) => (
            <button
              key={e.seq}
              onClick={() => setT(e.tick)}
              className={`flex w-full gap-2 px-3 py-1 text-left text-[12px] hover:bg-panel2 ${e.tick <= t ? '' : 'opacity-40'}`}
            >
              <span className="w-11 shrink-0 font-mono text-faint">{formatSimTime(e.tick)}</span>
              <span className={e.type === 'gate.resolved' ? 'text-emerald-300' : e.agentId ? 'text-sky-300' : 'text-fg'}>
                {e.type === 'gate.resolved' ? '결정 · ' : e.agentId ? `@${e.agentId} ` : '❯ '}
                {e.message}
              </span>
            </button>
          ))}
        </div>
        <div className="col-span-8 flex min-h-0 flex-col">
          <div className="border-b border-line">
            <Gantt sim={sim} onPick={(x) => setT(Math.min(sim.tick, x))} />
          </div>
          <div className="grid grid-cols-2 gap-0 border-b border-line">
            <div className="p-3">
              <div className="mb-1 text-[11px] font-semibold text-faint">Agent @ {formatSimTime(t)}</div>
              {snap.agentList().map((a) => (
                <div key={a.id} className="flex items-center gap-2 py-0.5 text-xs">
                  <span className="flex w-28 items-center gap-1.5 truncate font-mono font-semibold" style={{ color: agentColor(snap, a.id) }}>
                    <AgentAvatar sim={snap} id={a.id} size={15} />
                    {a.id}
                  </span>
                  <StatusBadge status={a.status} />
                  <span className="truncate text-dim">{a.taskId ?? ''}</span>
                </div>
              ))}
            </div>
            <div className="p-3">
              <div className="mb-1 text-[11px] font-semibold text-faint">Task @ {formatSimTime(t)}</div>
              {snap.visibleTasks().map((x) => (
                <div key={x.id} className="flex items-center gap-2 py-0.5 text-xs">
                  <span className="w-40 truncate font-mono">{x.id}</span>
                  <span className={TASK_STATUS[x.status].cls}>{TASK_STATUS[x.status].label}</span>
                </div>
              ))}
              <div className="mt-2 text-[11px] text-faint">파일 {snap.files.size}개</div>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <EventLog sim={sim} uptoTick={t} />
          </div>
        </div>
      </div>
    </div>
  );
}
