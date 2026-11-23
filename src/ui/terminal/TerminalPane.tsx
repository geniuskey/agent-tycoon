import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../store/session';
import { AgentAvatar, Btn, StatusBadge, Progress, agentColor, useSim } from '../common';
import { copySelection, fitTerm, getTerm, mountTerm } from './termRegistry';
import ChoiceCard from './ChoiceCard';

export default function TerminalPane({ paneId, agentId, index }: { paneId: string; agentId?: string; index: number }) {
  const sim = useSim();
  const host = useRef<HTMLDivElement>(null);
  const focused = useSession((s) => s.focusedPane === paneId);
  const maximized = useSession((s) => s.maximizedPane === paneId);
  const { input, focusPane, toggleMaximize, closePane } = useSession.getState();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<{ ok: boolean; chars: number; at: number } | null>(null);

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
      // Ctrl/Cmd+C: 선택이 있으면 복사, 없으면 기존대로 입력 취소(^C). Ctrl+Shift+C는 항상 복사.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && (inst.term.hasSelection() || e.shiftKey)) {
        e.preventDefault();
        void copySelection(inst, true);
        return false;
      }
      // Ctrl/Cmd+V(·Ctrl+Shift+V): xterm이 ^V로 삼키지 않게 넘겨 브라우저 붙여넣기 → onData로 들어온다
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') return false;
      return true;
    });
    let hide: ReturnType<typeof setTimeout> | undefined;
    const onCopied = (ev: Event) => {
      const { ok, chars } = (ev as CustomEvent<{ ok: boolean; chars: number }>).detail;
      if (!chars) return;
      setCopied({ ok, chars, at: Date.now() });
      clearTimeout(hide);
      hide = setTimeout(() => setCopied(null), 1400);
    };
    inst.el.addEventListener('term-copied', onCopied);
    return () => {
      ro.disconnect();
      d?.removeEventListener('focus', onFocus);
      inst.el.removeEventListener('term-copied', onCopied);
      clearTimeout(hide);
    };
  }, [inst, paneId, focusPane]);

  useEffect(() => {
    if (focused) inst.term.focus();
  }, [focused, inst]);

  const agent = agentId ? sim?.agents[agentId] : undefined;
  const role = agent ? sim?.roleDef(agent.role) : undefined;
  const removed = agentId && !agent;
  // 패널 정체성 색: Agent는 고유색, 오케스트레이터 셸은 하늘색
  const idColor = agentId ? agentColor(sim, agentId) : '#6493f4';
  const attention = agent && (agent.status === 'waiting' || agent.status === 'blocked' || agent.status === 'failed');
  const frame = attention
    ? agent!.status === 'waiting'
      ? 'border-amber-500/80 attn'
      : 'border-red-500/80'
    : focused
      ? 'border-accent'
      : 'border-line';

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded border bg-term ${frame}`}
      onMouseDown={() => focusPane(paneId)}
    >
      <div
        className={`flex h-8 shrink-0 items-center gap-2 border-b border-line px-2 text-xs ${focused ? 'bg-panel2' : 'bg-panel'}`}
        style={{ boxShadow: `inset 0 2px 0 ${idColor}${focused ? '' : '99'}` }}
      >
        <span className={`rounded px-1 font-mono text-[10px] ${focused ? 'bg-accent text-white' : 'bg-line text-faint'}`} title={`Alt+${index + 1}`}>
          {index + 1}
        </span>
        {agentId ? (
          <>
            <AgentAvatar sim={sim} id={agentId} />
            <span className="shrink-0 font-mono text-[12.5px] font-semibold whitespace-nowrap" style={{ color: idColor }}>
              {agentId}
            </span>
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
            <span className="font-mono text-[12.5px] font-semibold text-fg"><span className="text-sky-400">❯</span> orchestrator</span>
            <span className="truncate text-faint">셸 · 명령 및 알림</span>
          </>
        )}
        <div className="ml-auto flex items-center">
          {copied && (
            <span
              key={copied.at}
              className={`mr-1 rounded px-1.5 py-px text-[10.5px] ${copied.ok ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'}`}
            >
              {copied.ok ? `✓ 복사됨 · ${copied.chars}자` : '복사 실패'}
            </span>
          )}
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
            className="flex-1 rounded border border-line2 bg-bg px-2 py-0.5 font-mono text-xs outline-none focus:border-accent"
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
      {agentId && agent && <ChoiceCard paneId={paneId} agentId={agentId} onFreeText={() => inst.term.focus()} />}

    </div>
  );
}

export function TrustMeter({ value }: { value: number }) {
  const col = value >= 60 ? 'bg-emerald-400' : value >= 40 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <span className="flex items-center gap-1 text-[10.5px] text-faint" title="신뢰도 — 질문 방식에 따라 오르내립니다. 신뢰가 쌓여야 털어놓는 정보가 있습니다.">
      신뢰
      <span className="inline-block h-1.5 w-14 overflow-hidden rounded bg-line">
        <span className={`block h-full ${col} transition-all duration-500`} style={{ width: `${value}%` }} />
      </span>
      <span className="font-mono">{value}</span>
    </span>
  );
}
