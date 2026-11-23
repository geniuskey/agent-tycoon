import { Simulation } from '../src/engine/engine';
import { getScenario } from '../src/scenarios';
import { stripAnsi } from '../src/engine/ansi';

export function newSim(id: string, seed = 42): Simulation {
  const s = getScenario(id);
  if (!s) throw new Error(`scenario ${id} not found`);
  return new Simulation(s, seed);
}

/** 셸 패널에서 입력 */
export const sh = (sim: Simulation, text: string) => sim.input(text, { paneId: 'shell-1' });
/** Agent 패널에서 입력 */
export const to = (sim: Simulation, agentId: string, text: string) => sim.input(text, { paneId: `agent:${agentId}`, agentId });

/** 조건이 참이 될 때까지 tick 진행 */
export function runUntil(sim: Simulation, pred: () => boolean, max = 400): void {
  for (let i = 0; i < max; i++) {
    if (pred()) return;
    sim.step();
  }
  if (!pred()) throw new Error(`runUntil timeout at tick ${sim.tick}\n` + lastOutput(sim, 30));
}

export function lastOutput(sim: Simulation, n = 10): string {
  return sim.events
    .filter((e) => e.type === 'cli.output' || e.type === 'agent.log' || e.type === 'notify')
    .slice(-n)
    .map((e) => `[${e.type}${e.agentId ? ':' + e.agentId : ''}] ${stripAnsi(e.message)}`)
    .join('\n');
}

export const status = (sim: Simulation, id: string) => sim.agents[id]?.status;
export const taskStatus = (sim: Simulation, id: string) => sim.tasks[id]?.status;

/** 메신저로 메시지 보내기 (상대가 읽고 답을 다 보낼 때까지 tick 진행 — 회의 중이면 끝날 때까지) */
export function talk(sim: Simulation, personId: string, text: string): void {
  sim.input(text, { paneId: `person:${personId}`, personId });
  waitReply(sim, personId);
}
export function waitReply(sim: Simulation, personId: string, max = 200): void {
  const p = sim.people[personId];
  for (let i = 0; i < max && (p.inbox.length || p.pending.length); i++) sim.step();
}
export const trust = (sim: Simulation, id: string) => sim.people[id]?.trust;
export function lastSaid(sim: Simulation, personId: string, n = 3): string {
  return sim.events
    .filter((e) => e.type === 'person.said' && e.personId === personId)
    .slice(-n)
    .map((e) => stripAnsi(e.message))
    .join('\n');
}
