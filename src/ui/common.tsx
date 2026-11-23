import type { ReactNode } from 'react';
import type { AgentStatus, TaskStatus } from '../engine/types';
import type { Simulation } from '../engine/engine';
import { agentColor } from './agentColor';

export { agentColor };
import { useSession } from '../store/session';

export function useSim() {
  const sim = useSession((s) => s.sim);
  useSession((s) => s.version);
  return sim;
}

export const AGENT_STATUS: Record<AgentStatus, { label: string; cls: string; dot: string }> = {
  idle: { label: 'Idle', cls: 'text-dim border-line2', dot: 'bg-faint' },
  planning: { label: 'Planning', cls: 'text-cyan-300 border-cyan-800', dot: 'bg-cyan-400 pulse' },
  working: { label: 'Working', cls: 'text-sky-300 border-sky-800', dot: 'bg-sky-400 pulse' },
  waiting: { label: 'Waiting', cls: 'text-amber-300 border-amber-700', dot: 'bg-amber-400 pulse' },
  blocked: { label: 'Blocked', cls: 'text-red-300 border-red-800', dot: 'bg-red-400 pulse' },
  reviewing: { label: 'Reviewing', cls: 'text-violet-300 border-violet-800', dot: 'bg-violet-400 pulse' },
  failed: { label: 'Failed', cls: 'text-red-300 border-red-800', dot: 'bg-red-500' },
  completed: { label: 'Completed', cls: 'text-emerald-300 border-emerald-800', dot: 'bg-emerald-400' },
  interrupted: { label: 'Interrupted', cls: 'text-fuchsia-300 border-fuchsia-800', dot: 'bg-fuchsia-400' },
};

/** cls: 글자색 · pill: 상태 알약 · rail: 행 왼쪽 상태 막대 */
export const TASK_STATUS: Record<TaskStatus, { label: string; cls: string; pill: string; rail: string }> = {
  locked: { label: '선행 대기', cls: 'text-faint', pill: 'text-faint border border-line2', rail: 'bg-line2' },
  ready: { label: '시작 가능', cls: 'text-fg', pill: 'text-sky-200 bg-sky-500/15', rail: 'bg-sky-400/70' },
  assigned: { label: '배정됨', cls: 'text-cyan-300', pill: 'text-cyan-200 bg-cyan-500/15', rail: 'bg-cyan-400' },
  in_progress: { label: '진행 중', cls: 'text-sky-300', pill: 'text-sky-100 bg-sky-500/25', rail: 'bg-sky-400' },
  waiting: { label: '응답 대기', cls: 'text-amber-300', pill: 'text-amber-950 bg-amber-400 font-semibold', rail: 'bg-amber-400' },
  blocked: { label: '차단됨', cls: 'text-red-300', pill: 'text-red-950 bg-red-400 font-semibold', rail: 'bg-red-400' },
  done: { label: '완료', cls: 'text-emerald-300', pill: 'text-emerald-300 bg-emerald-500/10', rail: 'bg-emerald-500/60' },
  failed: { label: '실패', cls: 'text-red-300', pill: 'text-red-200 bg-red-500/20', rail: 'bg-red-500' },
};

export function AgentAvatar({ sim, id, size = 18 }: { sim: Simulation | null | undefined; id: string; size?: number }) {
  const col = agentColor(sim, id);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[4px] font-mono font-bold uppercase"
      style={{ width: size, height: size, fontSize: size * 0.55, background: `${col}26`, color: col, boxShadow: `inset 0 0 0 1px ${col}66` }}
      aria-hidden
    >
      {id.slice(0, 1)}
    </span>
  );
}

export function StatusBadge({ status }: { status: AgentStatus }) {
  const s = AGENT_STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-px text-[11px] ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  title,
  variant = 'ghost',
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  variant?: 'ghost' | 'primary' | 'outline' | 'danger';
  disabled?: boolean;
  className?: string;
}) {
  const v = {
    ghost: 'hover:bg-panel2 text-dim hover:text-fg',
    primary: 'bg-accent hover:bg-sky-600 text-white font-medium',
    outline: 'border border-line2 hover:bg-panel2 hover:text-fg text-dim',
    danger: 'border border-red-900 text-red-300 hover:bg-red-950',
  }[variant];
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors disabled:opacity-40 ${v} ${className}`}
    >
      {children}
    </button>
  );
}

/** IDE 탭 — 활성 탭은 아래 2px 강조선 */
export function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-3 text-[12px] transition-colors ${active ? 'text-strong' : 'text-dim hover:bg-panel2 hover:text-fg'}`}
    >
      {children}
      {active && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-accent" />}
    </button>
  );
}

export function SectionTitle({ children, right, count }: { children: ReactNode; right?: ReactNode; count?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex h-8 items-center gap-2 bg-panel px-3">
      <span className="text-[11px] font-semibold tracking-wide text-dim uppercase">{children}</span>
      {count !== undefined && <span className="rounded-full bg-line px-1.5 py-px font-mono text-[10px] text-dim">{count}</span>}
      <span className="ml-auto flex items-center">{right}</span>
    </div>
  );
}

export function Progress({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-1 overflow-hidden rounded bg-line ${className}`}>
      <div className="h-full bg-accent transition-all duration-300" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}
