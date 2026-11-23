import type { Simulation } from '../engine/engine';

/**
 * Agent 고유 색. 상태색(파랑·호박·빨강·초록)과 겹치지 않는 계열에서 role 순서대로 배정해
 * 사이드바·패널 머리·타임라인·이벤트 로그에서 같은 Agent가 같은 색으로 이어진다.
 */
const AGENT_PALETTE = ['#f472b6', '#2dd4bf', '#fb923c', '#a78bfa', '#a3e635', '#f9a8d4', '#5eead4', '#fdba74'];
export function agentColor(sim: Simulation | null | undefined, agentId: string): string {
  const roles = sim?.scenario.roles ?? [];
  const role = sim?.agents[agentId]?.role ?? agentId;
  let i = roles.findIndex((r) => r.id === role);
  if (i < 0) i = [...agentId].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return AGENT_PALETTE[i % AGENT_PALETTE.length];
}
