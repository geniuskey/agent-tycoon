import { c } from './ansi';
import type { Simulation } from './engine';
import { formatSimTime } from './engine';
import type { GroupDef, GroupRuntime } from './types';

/**
 * 그룹 대화방 · 합의 회의 (LLM 미사용, 규칙 기반).
 *
 *  - 플레이어가 회의를 소집하면 notice tick 뒤에 시작한다. 회의 중에는 참석자가 1:1 메시지를 읽지 않는다.
 *  - 회의는 남은 안건을 모두 한 번씩 다루거나, 전원 서명하거나, 플레이어가 마치면 끝난다 (시간 압박 없음).
 *  - 회의 중에 안건마다 제안을 하나 올린다. 참석자는 각자의 이해관계가 반영됐는지(when 조건)에 따라 동의/반대한다.
 *  - 반대가 남으면 안건은 보류된다. 1:1로 다시 조율한 뒤 다음 회의에서 재상정할 수 있다.
 *  - 모든 안건이 합의되면 참석자 전원이 서명한다.
 */

export function initGroups(sim: Simulation): Record<string, GroupRuntime> {
  const out: Record<string, GroupRuntime> = {};
  for (const g of sim.scenario.groups ?? []) {
    out[g.id] = {
      id: g.id,
      meetings: 0,
      signed: false,
      pending: [],
      discussed: [],
      agenda: Object.fromEntries(g.agenda.map((a) => [a.id, { status: 'open' as const, attempts: 0 }])),
    };
  }
  return out;
}

export function groupDef(sim: Simulation, id: string): GroupDef | undefined {
  return sim.scenario.groups?.find((g) => g.id === id);
}

export type MeetingState = 'none' | 'scheduled' | 'live';

export function meetingState(sim: Simulation, id: string, tick = sim.tick): MeetingState {
  const g = sim.groups[id];
  if (!g || g.start === undefined) return 'none';
  return tick < g.start ? 'scheduled' : 'live';
}

/** 이 사람이 지금 회의 중인 그룹 */
export function liveGroupOf(sim: Simulation, personId: string, tick = sim.tick): GroupDef | undefined {
  return (sim.scenario.groups ?? []).find((g) => g.members.includes(personId) && meetingState(sim, g.id, tick) === 'live');
}

function say(sim: Simulation, gid: string, text: string, opts: { speaker?: string; system?: boolean; at?: number } = {}) {
  const g = sim.groups[gid];
  const last = g.pending[g.pending.length - 1]?.at ?? 0;
  g.pending.push({ at: opts.at ?? Math.max(sim.tick + 1, last + 1), text, speaker: opts.speaker, system: opts.system });
}

function emitNow(sim: Simulation, gid: string, text: string, data: Record<string, unknown> = {}) {
  sim.emit('group.said', text, { data: { group: gid, ...data } });
}

/** meeting <group> call */
export function callMeeting(sim: Simulation, gid: string, pane: string): void {
  const def = groupDef(sim, gid);
  const g = sim.groups[gid];
  if (!def || !g) return sim.out(pane, c.red(`✗ 대화방 '${gid}' 없음`));
  if (g.signed) return sim.out(pane, c.yellow(`${def.name}: 모든 안건이 이미 합의되었습니다.`));
  const st = meetingState(sim, gid);
  if (st !== 'none') return sim.out(pane, c.yellow(`${def.name}: 이미 ${st === 'live' ? '진행 중' : `${formatSimTime(g.start!)} 시작 예정`}입니다.`));
  if (!sim.cond(def.requires)) return sim.out(pane, c.yellow(def.requiresText ?? `${def.name}: 아직 회의를 소집할 수 없습니다.`));
  const notice = def.notice ?? 15;
  g.start = sim.tick + notice;
  g.discussed = [];
  g.closing = false;
  g.meetings++;
  sim.emit('group.meeting', `${def.name} 소집 (${formatSimTime(g.start)})`, {
    paneId: pane,
    data: { group: gid, action: 'called', start: g.start, n: g.meetings },
  });
  emitNow(sim, gid, `📅 ${g.meetings > 1 ? `${g.meetings}차 ` : ''}회의 소집 — ${formatSimTime(g.start)} 시작`, { system: true });
  if (g.meetings > 1) {
    // 회의가 반복되면 참석자들이 지친다
    for (const m of def.members) sim.changeTrust(m, -2, 'meeting');
  }
  if (pane !== `group:${gid}`) sim.out(pane, c.green(`✓ ${def.name}을(를) ${formatSimTime(g.start)}에 소집했습니다.`));
}

/** meeting <group> end — 남은 발언이 끝나면 회의를 마친다 */
export function endMeeting(sim: Simulation, gid: string, pane: string): void {
  const def = groupDef(sim, gid);
  const g = sim.groups[gid];
  if (!def || !g) return sim.out(pane, c.red(`✗ 대화방 '${gid}' 없음`));
  if (meetingState(sim, gid) !== 'live') return sim.out(pane, c.yellow(`${def.name}: 진행 중인 회의가 없습니다.`));
  g.closing = true;
  if (pane !== `group:${gid}`) sim.out(pane, c.green(`✓ ${def.name}을(를) 마칩니다.`));
}

/** propose <group> <agendaId> <proposalId> */
export function propose(sim: Simulation, gid: string, agendaId: string, proposalId: string, pane: string): void {
  const def = groupDef(sim, gid);
  const g = sim.groups[gid];
  if (!def || !g) return sim.out(pane, c.red(`✗ 대화방 '${gid}' 없음`));
  const agenda = def.agenda.find((a) => a.id === agendaId);
  const prop = agenda?.proposals.find((p) => p.id === proposalId);
  if (!agenda || !prop) return sim.out(pane, c.red(`✗ 안건/제안 '${agendaId} ${proposalId}' 없음`));
  if (meetingState(sim, gid) !== 'live') return sim.out(pane, c.yellow(`${def.name}: 회의 중이 아닙니다. 먼저 회의를 소집하세요.`));
  const ar = g.agenda[agendaId];
  if (ar.status === 'agreed') return sim.out(pane, c.yellow(`'${agenda.title}'은(는) 이미 합의되었습니다.`));
  if (!sim.cond(prop.requires)) return sim.out(pane, c.yellow('지금은 올릴 수 없는 제안입니다.'));
  if (g.closing) return sim.out(pane, c.yellow(`${def.name}: 회의를 마치는 중입니다.`));
  if (g.discussed.includes(agendaId))
    return sim.out(pane, c.yellow(`'${agenda.title}'은(는) 이번 회의에서 이미 다뤘습니다. 반대한 사람과 1:1로 조율한 뒤 다음 회의에서 다시 올리세요.`));

  sim.metrics.nlInstructions++;
  emitNow(sim, gid, `[${agenda.title}] ${prop.label}`, { from: 'player', agenda: agendaId, proposal: proposalId });
  if (pane !== `group:${gid}`) sim.out(pane, c.dim(`→ ${def.name}: [${agenda.title}] ${prop.label}`));

  const objectors: string[] = [];
  for (const m of def.members) {
    const r = prop.reactions.find((x) => x.member === m && sim.cond(x.when));
    if (!r) continue; // 반응 없음 = 조용히 동의
    if (!r.agree) objectors.push(m);
    for (const line of sim.resolveLines(r.say)) say(sim, gid, line, { speaker: m });
    if (r.trust) sim.changeTrust(m, r.trust, 'player');
  }
  ar.attempts++;
  if (!g.discussed.includes(agendaId)) g.discussed.push(agendaId);
  const agreed = objectors.length === 0;
  sim.emit('group.agenda', `${def.name}: ${agenda.title} → ${prop.label} (${agreed ? '합의' : '보류'})`, {
    data: { group: gid, agenda: agendaId, proposal: proposalId, agreed, objectors, quality: prop.quality ?? 'neutral', attempt: ar.attempts },
  });
  if (agreed) {
    ar.status = 'agreed';
    ar.proposal = proposalId;
    sim.setFlag(`agenda.${agendaId}`, proposalId, 'meeting');
    sim.applyEffects(prop.effects, `group:${gid}`);
    say(sim, gid, `✔ 합의: ${agenda.title} — ${prop.label}`, { system: true });
  } else {
    ar.status = 'held';
    sim.setFlag(`agenda.${agendaId}.held`, true, 'meeting');
    const names = objectors.map((m) => sim.personDef(m)?.name ?? m).join(', ');
    say(sim, gid, `⏸ 보류: ${agenda.title} — 반대 ${names}`, { system: true });
  }
  if (def.agenda.every((a) => g.agenda[a.id].status === 'agreed')) {
    g.signed = true;
    say(sim, gid, `✍ 모든 안건 합의 — 참석자 ${def.members.length}명 서명 완료`, { system: true });
    sim.setFlag(`group.${gid}.signed`, true, 'meeting');
    sim.applyEffects(def.onSigned, `group:${gid}`);
    sim.notifyPlayer('success', `${def.name}: 모든 안건 합의·서명 완료`);
  }
  // 서명했거나, 남은 안건을 이번 회의에서 모두 한 번씩 다뤘으면 회의를 마친다
  if (g.signed || def.agenda.every((a) => g.agenda[a.id].status === 'agreed' || g.discussed.includes(a.id))) g.closing = true;
}

/** 매 tick: 회의 시작/종료, 발언 출력 */
export function stepGroups(sim: Simulation): void {
  for (const def of sim.scenario.groups ?? []) {
    const g = sim.groups[def.id];
    if (g.start !== undefined && sim.tick === g.start) {
      emitNow(sim, def.id, `● 회의 시작 — 참석: ${def.members.map((m) => sim.personDef(m)?.name ?? m).join(', ')}`, { system: true });
      for (const l of sim.resolveLines(def.opening)) emitNow(sim, def.id, l, { system: true });
      sim.applyEffects(def.onStart, `group:${def.id}`);
      sim.emit('group.meeting', `${def.name} 시작`, { data: { group: def.id, action: 'start', n: g.meetings } });
      sim.notifyPlayer('warn', `${def.name} 시작 — 메신저에서 안건을 올리세요`);
    }
    while (g.pending.length && g.pending[0].at <= sim.tick) {
      const p = g.pending.shift()!;
      emitNow(sim, def.id, p.text, p.speaker ? { speaker: p.speaker } : { system: true });
    }
    if (g.closing && !g.pending.length && meetingState(sim, def.id) === 'live') {
      const held = def.agenda.filter((a) => g.agenda[a.id].status !== 'agreed');
      emitNow(
        sim,
        def.id,
        held.length ? `● 회의 종료 — 미합의 안건 ${held.length}건 (${held.map((a) => a.title).join(', ')}). 1:1로 조율한 뒤 다시 소집할 수 있습니다.` : '● 회의 종료',
        { system: true },
      );
      sim.emit('group.meeting', `${def.name} 종료`, { data: { group: def.id, action: 'end', held: held.map((a) => a.id) } });
      g.start = undefined;
      g.closing = false;
      g.discussed = [];
    }
  }
}
