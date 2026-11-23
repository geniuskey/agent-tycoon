import type { Simulation } from '../engine/engine';

/**
 * Agent 고유 색. 상태색(파랑·호박·빨강·초록)과 겹치지 않는 계열에서 role 순서대로 배정해
 * 사이드바·패널 머리·타임라인·이벤트 로그에서 같은 Agent가 같은 색으로 이어진다.
 */
const AGENT_PALETTE = ['#e07fb0', '#4fb8a8', '#e3925a', '#a58be3', '#a3c45c', '#d9a0c4', '#6cc5c0', '#d9a873'];
export function agentColor(sim: Simulation | null | undefined, agentId: string): string {
  const roles = sim?.scenario.roles ?? [];
  const role = sim?.agents[agentId]?.role ?? agentId;
  let i = roles.findIndex((r) => r.id === role);
  if (i < 0) i = [...agentId].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return AGENT_PALETTE[i % AGENT_PALETTE.length];
}
