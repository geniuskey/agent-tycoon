import type { LoadedScenario } from '../engine/types';
import { DOMAINS, FUNCTIONS, TASK_TYPES } from '../scenarios';
import { Btn, useSim } from './common';
import AppWindow, { WIN_BOTTOM, WIN_TOP, type Rect } from './AppWindow';

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
      {s.unlock && (
        <div className="rounded-md border border-sky-700/60 bg-sky-500/[0.07] px-3.5 py-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded bg-sky-500/25 px-1.5 py-px text-[10.5px] font-semibold tracking-wide text-sky-200">새로 열린 기능</span>
            <span className="text-[13.5px] font-semibold text-strong">{s.unlock.title}</span>
          </div>
          <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] leading-relaxed text-fg">
            {s.unlock.text.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
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
        {s.roles.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold text-dim">이용 가능한 Agent</div>
            {s.roles.map((r) => (
              <div key={r.id} className="mb-1">
                <span className="font-mono text-xs text-sky-300">{r.id}</span> <span className="text-xs">{r.name}</span>
                <div className="text-[11px] text-faint">{r.skills.join(' · ')}</div>
              </div>
            ))}
          </div>
        )}
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

function defaultRect(): Rect {
  const w = Math.min(780, window.innerWidth - 48);
  const h = Math.min(680, window.innerHeight - WIN_TOP - WIN_BOTTOM - 32);
  return { x: Math.round((window.innerWidth - w) / 2), y: WIN_TOP + Math.round((window.innerHeight - WIN_TOP - WIN_BOTTOM - h) / 2), w, h };
}

/** 업무 브리핑은 작업표시줄의 앱 창이다 — 띄워 둔 채로 터미널·브라우저를 쓸 수 있다 */
export default function Briefing({ onClose }: { onClose: () => void }) {
  const sim = useSim()!;
  return (
    <AppWindow id="briefing" title="업무 브리핑" subtitle={sim.scenario.briefing.requester.name} storageKey="at-briefing-rect" defaultRect={defaultRect} minW={480} minH={360} onMinimize={onClose}>
      <div className="h-full overflow-auto p-6">
        <h2 className="mb-4 text-xl font-semibold text-strong">{sim.scenario.briefing.title}</h2>
        <BriefingBody s={sim.scenario} />
        <div className="mt-5 rounded-md border border-line bg-panel p-3 text-[12px] leading-relaxed text-dim">
          <div className="mb-1 font-semibold text-fg">시작하는 방법</div>
          {sim.has('terminal') ? (
            <>
              1. 왼쪽 <b className="text-fg">＋ 새 세션</b> 또는 터미널에 <code className="text-sky-300">agent spawn &lt;role&gt;</code> — Agent마다 전용 터미널이 열립니다.
              <br />
              2. Agent 패널 아래 선택 카드에서 <b className="text-fg">지시 하나</b>와 필요한 <b className="text-fg">조건(복수)</b>을 골라 지시합니다. 사람은 작업표시줄의 <b className="text-fg">메신저</b>에서 대화하고 질문을 고릅니다.
              <br />
              3. Agent가 <span className="text-amber-300">Waiting/Blocked</span> 상태가 되면 선택 카드에서 판단을 내려 주세요 (단일/복수 선택). 결과물은 오른쪽 브라우저·파일에서 확인합니다.
              <br />
            </>
          ) : (
            <>
              1. 브라우저에서 <b className="text-fg">요청 메일</b>과 <b className="text-fg">담당자 목록</b>을 읽습니다.
              <br />
              2. 작업표시줄의 <b className="text-fg">메신저</b>에서 담당자를 고르고, 보낼 질문을 선택합니다. 답은 상대가 읽는 대로 옵니다.
              <br />
              3. 왼쪽 <b className="text-fg">업무</b> 목록이 모두 체크되면 끝입니다. 막히면 상단 <b className="text-fg">힌트</b>를 누르세요.
              <br />
            </>
          )}
          4. 완료되면 상단 <b className="text-fg">제출</b> → 학습 피드백. 이 창은 작업표시줄의 <b className="text-fg">업무 브리핑</b>으로 언제든 다시 엽니다.
        </div>
        <div className="mt-4 flex justify-end">
          <Btn variant="primary" onClick={onClose}>
            작업 시작
          </Btn>
        </div>
      </div>
    </AppWindow>
  );
}
