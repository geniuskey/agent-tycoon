import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../store/session';
import { Btn, StatusBadge, Progress, useSim } from '../common';
import { fitTerm, getTerm, mountTerm } from './termRegistry';

export default function TerminalPane({ paneId, agentId, index }: { paneId: string; agentId?: string; index: number }) {
  const sim = useSim();
  const host = useRef<HTMLDivElement>(null);
  const focused = useSession((s) => s.focusedPane === paneId);
  const maximized = useSession((s) => s.maximizedPane === paneId);
  const { input, focusPane, toggleMaximize, closePane } = useSession.getState();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const inst = getTerm(paneId, agentId, sim, (text) => input(paneId, text));

  useEffect(() => {
    if (!host.current) return;
    mountTerm(inst, host.current);
    const ro = new ResizeObserver(() => fitTerm(inst));
    ro.observe(host.current);
    const d = inst.term.textarea;
    const onFocus = () => focusPane(paneId);
    d?.addEventListener('focus', onFocus);
    inst.term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        return false;
      }
      if (e.altKey && (/^Digit[1-9]$/.test(e.code) || e.key === 'Enter')) return false;
      return true;
    });
    return () => {
      ro.disconnect();
      d?.removeEventListener('focus', onFocus);
    };
  }, [inst, paneId, focusPane]);

  useEffect(() => {
    if (focused) inst.term.focus();
  }, [focused, inst]);

  const agent = agentId ? sim?.agents[agentId] : undefined;
  const role = agent ? sim?.roleDef(agent.role) : undefined;
  const removed = agentId && !agent;

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-[#0d121c] ${
        focused ? 'border-sky-700/80 shadow-[0_0_0_1px_rgba(56,189,248,0.15)]' : 'border-line'
      }`}
      onMouseDown={() => focusPane(paneId)}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 text-xs">
        <span className="rounded bg-line px-1 font-mono text-[10px] text-faint" title={`Alt+${index + 1}`}>
          {index + 1}
        </span>
        {agentId ? (
          <>
            <span className="font-mono font-semibold text-fuchsia-300">{agentId}</span>
            {role && <span className="truncate text-faint">{role.name}</span>}
            {agent && <StatusBadge status={agent.status} />}
            {agent?.taskId && (
              <span className="flex min-w-0 items-center gap-1.5 text-dim">
                <span className="truncate font-mono text-[11px]">{agent.taskId}</span>
                <Progress value={sim!.taskProgress(agent.taskId)} className="w-14" />
              </span>
            )}
            {removed && <span className="text-red-300">제거됨</span>}
          </>
        ) : (
          <>
            <span className="font-mono font-semibold text-sky-300">orchestrator</span>
            <span className="text-faint">셸 · 명령 및 알림</span>
          </>
        )}
        <div className="ml-auto flex items-center">
          {agent && ['working', 'planning', 'reviewing', 'waiting', 'blocked'].includes(agent.status) && (
            <Btn title="작업 중단" onClick={() => input(paneId, `agent interrupt ${agentId}`)}>
              ■
            </Btn>
          )}
          {agent?.status === 'interrupted' && (
            <Btn title="재개" onClick={() => input(paneId, `agent resume ${agentId}`)}>
              ▶
            </Btn>
          )}
          {agent?.status === 'failed' && (
            <Btn title="재시도" onClick={() => input(paneId, `agent retry ${agentId}`)}>
              ↻
            </Btn>
          )}
          <Btn title="로그 검색 (Ctrl+F)" onClick={() => setSearchOpen((v) => !v)}>
            ⌕
          </Btn>
          <Btn title="최대화 (Alt+Enter)" onClick={() => toggleMaximize(paneId)}>
            {maximized ? '▣' : '□'}
          </Btn>
          <Btn title="패널 닫기" onClick={() => closePane(paneId)}>
            ✕
          </Btn>
        </div>
      </div>
      {searchOpen && (
        <div className="flex items-center gap-1 border-b border-line bg-panel2 px-2 py-1">
          <input
            autoFocus
            value={query}
            placeholder="로그 검색…"
            onChange={(e) => {
              setQuery(e.target.value);
              inst.search.findNext(e.target.value, { incremental: true });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.shiftKey ? inst.search.findPrevious(query) : inst.search.findNext(query));
              if (e.key === 'Escape') {
                setSearchOpen(false);
                inst.search.clearDecorations();
                inst.term.focus();
              }
            }}
            className="flex-1 rounded border border-line2 bg-bg px-2 py-0.5 font-mono text-xs outline-none focus:border-sky-700"
          />
          <Btn onClick={() => inst.search.findPrevious(query)}>↑</Btn>
          <Btn onClick={() => inst.search.findNext(query)}>↓</Btn>
          <Btn
            onClick={() => {
              setSearchOpen(false);
              inst.search.clearDecorations();
            }}
          >
            ✕
          </Btn>
        </div>
      )}
      <div ref={host} className="min-h-0 flex-1" onClick={() => inst.term.focus()} />
    </div>
  );
}
