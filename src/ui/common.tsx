import type { ReactNode } from 'react';
import type { AgentStatus, TaskStatus } from '../engine/types';
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

export const TASK_STATUS: Record<TaskStatus, { label: string; cls: string }> = {
  locked: { label: '대기(선행)', cls: 'text-faint' },
  ready: { label: '시작 가능', cls: 'text-fg' },
  assigned: { label: '배정됨', cls: 'text-cyan-300' },
  in_progress: { label: '진행 중', cls: 'text-sky-300' },
  waiting: { label: '응답 대기', cls: 'text-amber-300' },
  blocked: { label: '차단됨', cls: 'text-red-300' },
  done: { label: '완료', cls: 'text-emerald-300' },
  failed: { label: '실패', cls: 'text-red-300' },
};

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
    primary: 'bg-sky-500/90 hover:bg-sky-400 text-slate-950 font-semibold',
    outline: 'border border-line2 hover:border-sky-600 hover:text-fg text-dim',
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

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
      <span className="text-[11px] font-semibold tracking-wider text-faint uppercase">{children}</span>
      {right}
    </div>
  );
}

export function SimBadge() {
  return (
    <span
      title="실제 AI API를 호출하지 않는 시뮬레이션입니다. 모든 데이터는 합성 데이터입니다."
      className="rounded border border-amber-700/60 bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold tracking-wider text-amber-300"
    >
      SIMULATION
    </span>
  );
}

export function Progress({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-1 overflow-hidden rounded bg-line ${className}`}>
      <div className="h-full bg-sky-400 transition-all duration-300" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}
