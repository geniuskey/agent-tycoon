import type { Cond, FlagValue, TaskRuntime } from './types';

export interface CondContext {
  flags: Record<string, FlagValue>;
  tasks: Record<string, TaskRuntime>;
  fileExists: (path: string) => boolean;
  trust?: (person: string) => number;
  observed?: (target: string) => boolean;
}

export function evalCond(cond: Cond | undefined, ctx: CondContext): boolean {
  if (cond === undefined) return true;
  if (typeof cond === 'string') {
    if (cond.startsWith('!')) return !ctx.flags[cond.slice(1)];
    return !!ctx.flags[cond];
  }
  if ('all' in cond) return cond.all.every((c) => evalCond(c, ctx));
  if ('any' in cond) return cond.any.some((c) => evalCond(c, ctx));
  if ('not' in cond) return !evalCond(cond.not, ctx);
  if ('taskDone' in cond) return ctx.tasks[cond.taskDone]?.status === 'done';
  if ('taskStatus' in cond) {
    const st = ctx.tasks[cond.taskStatus]?.status;
    return Array.isArray(cond.is) ? cond.is.includes(st as never) : st === cond.is;
  }
  if ('fileExists' in cond) return ctx.fileExists(cond.fileExists);
  if ('gate' in cond) {
    const v = ctx.flags[`gate.${cond.gate}`];
    return Array.isArray(cond.chose) ? cond.chose.includes(v as string) : v === cond.chose;
  }
  if ('observed' in cond) return !!ctx.observed?.(cond.observed);
  if ('trust' in cond) {
    const t = ctx.trust?.(cond.trust) ?? 0;
    return (cond.gte === undefined || t >= cond.gte) && (cond.lt === undefined || t < cond.lt);
  }
  if ('flag' in cond) {
    const v = ctx.flags[cond.flag];
    return cond.eq === undefined ? !!v : v === cond.eq;
  }
  return false;
}
