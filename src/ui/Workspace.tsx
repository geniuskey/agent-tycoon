import { useEffect, useState } from 'react';
import { Panel, PanelGroup } from 'react-resizable-panels';
import { TICK_MS, useSession, type RightTab } from '../store/session';
import { DOMAINS } from '../scenarios';
import { stripAnsi } from '../engine/ansi';
import { Btn, Tab, useSim } from './common';
import Sidebar from './Sidebar';
import TerminalGrid, { ResizeHandle } from './terminal/TerminalGrid';
import Browser from './browser/Browser';
import { FileExplorer, FilePreview } from './files/Files';
import { EventLog, Gantt, Notifications } from './Timeline';
import Briefing from './Briefing';
import { MessengerWindow } from './messenger/MessengerWindow';

export default function Workspace() {
  const sim = useSim()!;
  const speed = useSession((s) => s.speed);
  const rightTab = useSession((s) => s.rightTab);
  const showBriefing = useSession((s) => s.showBriefing);
  const bottomTab = useSession((s) => s.bottomTab);
  const bottomOpen = useSession((s) => s.bottomOpen);
  const { setRightTab, goHome, input, addShellPane, setShowBriefing, persist, setBottom } = useSession.getState();

  // 시뮬레이션 클럭 — tick 단위 상태 전이 (재현성: 명령은 tick에 기록됨)
  useEffect(() => {
    if (!speed || sim.submitted) return;
    const h = setInterval(() => sim.step(), TICK_MS / speed);
    const p = setInterval(() => persist(), 4000);
    return () => {
      clearInterval(h);
      clearInterval(p);
    };
  }, [speed, sim, persist]);

  const attention = sim.agentList().filter((a) => ['waiting', 'blocked', 'failed'].includes(a.status)).length;
  const busy = sim.agentList().filter((a) => ['working', 'planning', 'reviewing'].includes(a.status)).length;

  // 단계별로 열리는 기능 — 처음엔 메신저·브라우저만, 단계마다 하나씩 늘어난다
  const term = sim.has('terminal');
  const timeline = sim.has('timeline');
  const tabs: { id: RightTab; label: string }[] = [
    { id: 'browser', label: '브라우저' },
    ...(sim.has('files')
      ? [
          { id: 'files' as const, label: '파일' },
          { id: 'preview' as const, label: '미리보기' },
        ]
      : []),
  ];
  const tab = tabs.some((t) => t.id === rightTab) ? rightTab : 'browser';

  // 터미널이 없는 단계에서는 힌트·제출 결과를 터미널 대신 상단 말풍선으로 보여 준다
  const [note, setNote] = useState<string | null>(null);
  const command = (cmd: string) => {
    const from = sim.events.length;
    input('shell-1', cmd);
    if (term) return;
    const out = sim.events.slice(from).filter((e) => e.type === 'cli.output');
    setNote(out.map((e) => stripAnsi(e.message)).join('\n') || null);
  };

  return (
    // IDE 아무 곳이나 누르면 IDE가 앞으로 (창 안을 누르면 그 창이 이어서 앞으로 온다)
    <div className="flex h-full flex-col" onPointerDownCapture={() => useSession.getState().raiseWindow(null)}>
      {/* Top bar — 제목과 작업 명령만. 상태는 하단 상태바로 */}
      <header className="relative flex h-10 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
        <button onClick={goHome} className="font-mono text-[13px] font-semibold text-fg hover:text-strong" title="홈으로">
          <span className="text-sky-400">&gt;_</span> Agent Tycoon
        </button>
        <div className="h-4 w-px bg-line2" />
        <div className="min-w-0 truncate text-[13px] text-fg">{sim.scenario.title}</div>
        <div className="ml-auto flex items-center gap-1.5">
          <Btn variant="outline" onClick={() => command('hint')}>
            힌트
          </Btn>
          <Btn variant="primary" onClick={() => command('submit')}>
            제출
          </Btn>
        </div>
        {note && (
          <div className="absolute top-11 right-3 z-40 w-[380px] max-w-[calc(100vw-24px)] rounded-md border border-line2 bg-panel2 p-3 text-[12.5px] leading-relaxed text-fg shadow-xl">
            <div className="whitespace-pre-wrap">{note}</div>
            <div className="mt-2 flex justify-end">
              <Btn onClick={() => setNote(null)}>닫기</Btn>
            </div>
          </div>
        )}
      </header>

      <PanelGroup direction="horizontal" className="min-h-0 flex-1" autoSaveId={term ? 'at-main' : 'at-main-simple'}>
        <Panel defaultSize={17} minSize={12} maxSize={30}>
          <Sidebar />
        </Panel>
        {term && (
          <>
            <ResizeHandle dir="h" />
            <Panel defaultSize={50} minSize={30} className="relative bg-bg">
              <PanelGroup direction="vertical" autoSaveId="at-center">
                <Panel minSize={30}>
                  <div className="flex h-full flex-col">
                    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line bg-panel px-3 text-[11px] text-faint">
                      <span className="font-semibold text-fg">터미널</span>
                      <span className="ml-2 hidden xl:inline">Alt+1..9 이동 · Alt+Enter 최대화 · Ctrl+F 검색 · Tab 자동완성</span>
                      {sim.has('multiAgent') && (
                        <Btn className="ml-auto" onClick={addShellPane} title="셸 패널 추가">
                          ＋ 셸
                        </Btn>
                      )}
                    </div>
                    <div className="min-h-0 flex-1">
                      <TerminalGrid />
                    </div>
                  </div>
                </Panel>
                {timeline && bottomOpen && (
                  <>
                    <ResizeHandle dir="v" />
                    <Panel defaultSize={24} minSize={10}>
                      <BottomPanel tab={bottomTab} setTab={(t) => setBottom(t)} onClose={() => setBottom(undefined, false)} />
                    </Panel>
                  </>
                )}
              </PanelGroup>
              {timeline && !bottomOpen && (
                <button onClick={() => setBottom(undefined, true)} className="absolute bottom-1 left-1/2 rounded border border-line2 bg-panel px-2 text-[11px] text-dim hover:text-fg">
                  타임라인 열기
                </button>
              )}
            </Panel>
          </>
        )}
        <ResizeHandle dir="h" />
        <Panel defaultSize={term ? 33 : 83} minSize={20}>
          <div className="flex h-full min-h-0 flex-col bg-paper">
            <div className="flex h-8 shrink-0 items-stretch border-b border-line bg-panel px-1">
              {tabs.map((t) => (
                <Tab key={t.id} active={tab === t.id} onClick={() => setRightTab(t.id)}>
                  {t.label}
                </Tab>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {tab === 'browser' && <Browser />}
              {tab === 'files' && <FileExplorer />}
              {tab === 'preview' && <FilePreview />}
            </div>
          </div>
        </Panel>
      </PanelGroup>
      <StatusBar attention={attention} busy={busy} />
      <MessengerWindow />
      {showBriefing && <Briefing onClose={() => setShowBriefing(false)} />}
    </div>
  );
}

function BottomPanel({
  tab,
  setTab,
  onClose,
}: {
  tab: 'notify' | 'timeline' | 'events';
  setTab: (t: 'notify' | 'timeline' | 'events') => void;
  onClose: () => void;
}) {
  const sim = useSim()!;
  const n = sim.events.filter((e) => e.type === 'notify').length;
  return (
    <div className="flex h-full min-h-0 flex-col border-t border-line bg-panel">
      <div className="flex h-8 shrink-0 items-stretch border-b border-line px-1">
        {(
          [
            ['timeline', '타임라인'],
            ['notify', `알림 ${n}`],
            ['events', '이벤트 로그'],
          ] as const
        ).map(([id, label]) => (
          <Tab key={id} active={tab === id} onClick={() => setTab(id)}>
            {label}
          </Tab>
        ))}
        <Btn className="my-auto ml-auto" onClick={onClose}>
          ✕
        </Btn>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'timeline' && <Gantt sim={sim} />}
        {tab === 'notify' && <Notifications sim={sim} />}
        {tab === 'events' && <EventLog sim={sim} />}
      </div>
    </div>
  );
}

/** IDE 상태바 — Agent 상태만. 평소 파랑, 판단을 기다리는 Agent가 있으면 호박색, 제출 후 초록. 시계·배속은 작업표시줄 트레이에 */
function StatusBar({ attention, busy }: { attention: number; busy: number }) {
  const sim = useSim()!;
  const tone = sim.submitted ? 'bg-emerald-700 text-white' : attention > 0 ? 'bg-amber-400 text-amber-950' : 'bg-accent text-white';
  return (
    <footer className={`flex h-6 shrink-0 items-center gap-3 px-2 text-[11px] transition-colors ${tone}`}>
      <span className="truncate opacity-85">
        {DOMAINS[sim.scenario.domain] ?? sim.scenario.domain} · {sim.scenario.company.org}
      </span>
      <span className="font-mono opacity-70">seed {sim.seed}</span>
      <span className="mx-1 h-3 w-px bg-current opacity-30" />
      {sim.submitted ? (
        <span className="font-semibold">✓ 제출됨</span>
      ) : attention > 0 ? (
        <span className="font-bold">⏸ 개입 필요 {attention}</span>
      ) : (
        <span className="opacity-80">개입 필요 0</span>
      )}
      <span className="flex items-center gap-1.5 opacity-90">
        <span className={`h-1.5 w-1.5 rounded-full bg-current ${busy ? 'pulse' : 'opacity-50'}`} />
        작업 중 {busy}
      </span>
    </footer>
  );
}
