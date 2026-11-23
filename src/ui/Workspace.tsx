import { useEffect, useState } from 'react';
import { Panel, PanelGroup } from 'react-resizable-panels';
import { formatSimTime } from '../engine/engine';
import { TICK_MS, useSession, type RightTab } from '../store/session';
import { DOMAINS } from '../scenarios';
import { Btn, SimBadge, useSim } from './common';
import Sidebar from './Sidebar';
import TerminalGrid, { ResizeHandle } from './terminal/TerminalGrid';
import Browser from './browser/Browser';
import { FileExplorer, FilePreview } from './files/Files';
import { EventLog, Gantt, Notifications } from './Timeline';
import Briefing from './Briefing';
import Messenger, { totalUnread } from './messenger/Messenger';

export default function Workspace() {
  const sim = useSim()!;
  const speed = useSession((s) => s.speed);
  const rightTab = useSession((s) => s.rightTab);
  const readSeq = useSession((s) => s.readSeq);
  const showBriefing = useSession((s) => s.showBriefing);
  const { setSpeed, setRightTab, goHome, input, addShellPane, setShowBriefing, persist } = useSession.getState();
  const [bottomTab, setBottomTab] = useState<'notify' | 'timeline' | 'events'>('timeline');
  const [bottomOpen, setBottomOpen] = useState(true);

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

  const hasPeople = !!sim.scenario.people?.length;
  const unread = hasPeople ? totalUnread(sim, readSeq) : 0;
  const tabs: { id: RightTab; label: string; badge?: number }[] = [
    ...(hasPeople ? [{ id: 'messenger' as const, label: '메신저', badge: unread }] : []),
    { id: 'browser', label: '브라우저' },
    { id: 'files', label: '파일' },
    { id: 'preview', label: '미리보기' },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
        <button onClick={goHome} className="font-mono text-sm font-bold text-sky-300" title="홈으로">
          &gt;_ Agent Tycoon
        </button>
        <SimBadge />
        <div className="mx-2 h-5 w-px bg-line" />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-fg">{sim.scenario.title}</div>
          <div className="truncate text-[10.5px] text-faint">
            {DOMAINS[sim.scenario.domain] ?? sim.scenario.domain} · {sim.scenario.company.org} · seed {sim.seed}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* 상태 묶음: 개입 필요 · 작업 중 · 시계 · 배속 */}
          {attention > 0 ? (
            <span className="attn rounded bg-amber-400 px-2 py-0.5 text-[11.5px] font-bold text-amber-950">⏸ 개입 필요 {attention}</span>
          ) : (
            <span className="rounded border border-line2 px-2 py-0.5 text-[11px] text-faint">개입 필요 0</span>
          )}
          <span className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] ${busy ? 'bg-sky-500/10 text-sky-200' : 'text-faint'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${busy ? 'pulse bg-sky-400' : 'bg-faint'}`} />
            작업 중 {busy}
          </span>
          <div className="mx-1 h-5 w-px bg-line" />
          <span className="font-mono text-[15px] font-semibold tracking-tight text-strong tabular-nums" title="가상 업무 시간 (1 tick = 1분)">
            {formatSimTime(sim.tick)}
          </span>
          <div className="flex items-center rounded border border-line2">
            {[0, 1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2 py-0.5 text-[11px] ${speed === s ? (s === 0 ? 'bg-amber-500/20 text-amber-200' : 'bg-sky-500/20 text-sky-200') : 'text-dim hover:text-fg'}`}
                title={s === 0 ? '일시정지' : `${s}배속`}
              >
                {s === 0 ? '❚❚' : `${s}x`}
              </button>
            ))}
          </div>
          <div className="mx-1 h-5 w-px bg-line" />
          <Btn variant="outline" onClick={() => setShowBriefing(true)}>
            브리핑
          </Btn>
          <Btn variant="outline" onClick={() => input('shell-1', 'hint')}>
            힌트
          </Btn>
          <Btn variant="primary" onClick={() => input('shell-1', 'submit')}>
            제출
          </Btn>
        </div>
      </header>

      <PanelGroup direction="horizontal" className="min-h-0 flex-1" autoSaveId="at-main">
        <Panel defaultSize={17} minSize={12} maxSize={30}>
          <Sidebar />
        </Panel>
        <ResizeHandle dir="h" />
        <Panel defaultSize={50} minSize={30} className="relative bg-bg">
          <PanelGroup direction="vertical" autoSaveId="at-center">
            <Panel minSize={30}>
              <div className="flex h-full flex-col">
                <div className="flex h-7 shrink-0 items-center gap-1 border-b border-line px-2 text-[11px] text-faint">
                  <span className="font-semibold text-dim">터미널 작업 공간</span>
                  <span className="ml-2 hidden xl:inline">Alt+1..9 이동 · Alt+Enter 최대화 · Ctrl+F 검색 · Tab 자동완성</span>
                  <Btn className="ml-auto" onClick={addShellPane} title="셸 패널 추가">
                    ＋ 셸
                  </Btn>
                </div>
                <div className="min-h-0 flex-1">
                  <TerminalGrid />
                </div>
              </div>
            </Panel>
            {bottomOpen && (
              <>
                <ResizeHandle dir="v" />
                <Panel defaultSize={24} minSize={10}>
                  <BottomPanel tab={bottomTab} setTab={setBottomTab} onClose={() => setBottomOpen(false)} />
                </Panel>
              </>
            )}
          </PanelGroup>
          {!bottomOpen && (
            <button onClick={() => setBottomOpen(true)} className="absolute bottom-1 left-1/2 rounded border border-line2 bg-panel px-2 text-[11px] text-dim">
              타임라인 열기
            </button>
          )}
        </Panel>
        <ResizeHandle dir="h" />
        <Panel defaultSize={33} minSize={20}>
          <div className="flex h-full min-h-0 flex-col bg-paper">
            <div className="flex h-8 shrink-0 items-end gap-0.5 border-b border-line bg-panel px-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setRightTab(t.id)}
                  className={`rounded-t px-3 py-1 text-xs ${rightTab === t.id ? 'border border-b-0 border-line bg-paper font-medium text-strong' : 'text-dim hover:text-fg'}`}
                >
                  {t.label}
                  {!!t.badge && (
                    <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[10px] leading-4 font-bold text-white">{t.badge}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {rightTab === 'messenger' && hasPeople && <Messenger />}
              {rightTab === 'browser' && <Browser />}
              {rightTab === 'files' && <FileExplorer />}
              {rightTab === 'preview' && <FilePreview />}
            </div>
          </div>
        </Panel>
      </PanelGroup>
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
      <div className="flex h-7 shrink-0 items-center gap-1 border-b border-line px-1">
        {(
          [
            ['timeline', '타임라인'],
            ['notify', `알림 ${n}`],
            ['events', '이벤트 로그'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`-mb-px h-7 border-b-2 px-2.5 text-[11.5px] ${tab === id ? 'border-sky-400 font-medium text-strong' : 'border-transparent text-dim hover:text-fg'}`}
          >
            {label}
          </button>
        ))}
        <Btn className="ml-auto" onClick={onClose}>
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
