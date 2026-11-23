import type { LoadedScenario } from '../engine/types';
import { DOMAINS, FUNCTIONS, TASK_TYPES } from '../scenarios';
import { Btn, useSim } from './common';

export function BriefingBody({ s }: { s: LoadedScenario }) {
  const b = s.briefing;
  return (
    <div className="space-y-4 text-[13px]">
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded bg-sky-500/15 px-2 py-0.5 text-sky-300">{DOMAINS[s.domain] ?? s.domain}</span>
        <span className="rounded bg-line px-2 py-0.5 text-dim">{FUNCTIONS[s.function] ?? s.function}</span>
        <span className="rounded bg-line px-2 py-0.5 text-dim">{TASK_TYPES[s.taskType] ?? s.taskType}</span>
        <span className="rounded bg-line px-2 py-0.5 text-dim">난이도 {'●'.repeat(s.difficulty)}{'○'.repeat(3 - s.difficulty)}</span>
        <span className="rounded bg-line px-2 py-0.5 text-dim">약 {s.estMinutes}분</span>
      </div>
      <div className="text-xs text-faint">
        {s.company.name} · {s.company.org} — 요청자 <span className="text-dim">{b.requester.name} ({b.requester.role})</span>
      </div>
      <p className="leading-relaxed text-fg">{b.background}</p>
      <div>
        <div className="mb-1 text-xs font-semibold text-dim">목표</div>
        <p className="leading-relaxed">{b.goal}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold text-dim">완료 조건</div>
          <ul className="list-disc space-y-0.5 pl-4 text-[12.5px]">
            {b.completionCriteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-dim">산출물</div>
          <ul className="list-disc space-y-0.5 pl-4 font-mono text-[12px]">
            {b.deliverables.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {b.constraints?.length ? (
            <>
              <div className="mt-3 mb-1 text-xs font-semibold text-dim">제약</div>
              <ul className="list-disc space-y-0.5 pl-4 text-[12.5px]">
                {b.constraints.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold text-dim">이용 가능한 Agent</div>
          {s.roles.map((r) => (
            <div key={r.id} className="mb-1">
              <span className="font-mono text-xs text-sky-300">{r.id}</span> <span className="text-xs">{r.name}</span>
              <div className="text-[11px] text-faint">{r.skills.join(' · ')}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-dim">학습 목표</div>
          <ul className="list-disc space-y-0.5 pl-4 text-[12.5px]">
            {s.learningObjectives.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function Briefing({ onClose }: { onClose: () => void }) {
  const sim = useSim()!;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="max-h-full w-full max-w-3xl overflow-auto rounded-lg border border-line2 bg-panel p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] tracking-wider text-faint uppercase">업무 브리핑</div>
            <h2 className="text-xl font-semibold text-slate-100">{sim.scenario.briefing.title}</h2>
          </div>
          <Btn onClick={onClose}>✕</Btn>
        </div>
        <BriefingBody s={sim.scenario} />
        <div className="mt-5 rounded-md border border-line bg-bg p-3 text-[12px] leading-relaxed text-dim">
          <div className="mb-1 font-semibold text-fg">시작하는 방법</div>
          1. 왼쪽 <b className="text-fg">＋ 생성</b> 또는 터미널에 <code className="text-sky-300">agent spawn &lt;role&gt;</code> — Agent마다 전용 터미널이 열립니다.
          <br />
          2. Agent 터미널에 자연어로 지시하거나 <code className="text-sky-300">agent assign &lt;agent&gt; &lt;task&gt;</code>
          <br />
          3. Agent가 <span className="text-amber-300">Waiting/Blocked</span> 상태가 되면 판단을 내려 주세요. 결과물은 오른쪽 브라우저·파일에서 확인합니다.
          <br />
          4. 완료되면 상단 <b className="text-fg">제출</b> → 학습 피드백
        </div>
        <div className="mt-4 flex justify-end">
          <Btn variant="primary" onClick={onClose}>
            작업 시작
          </Btn>
        </div>
      </div>
    </div>
  );
}
