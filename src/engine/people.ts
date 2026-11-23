import { c, padEnd } from './ansi';
import type { Simulation } from './engine';
import type { TopicDef } from './types';
import { SIM_START_MINUTES, formatSimTime } from './engine';

/**
 * 가상 인물과의 대화·협의 시뮬레이션 (LLM 미사용, 규칙 기반).
 *
 *  - 인물마다 신뢰도(0–100)가 있고, 질문 방식에 따라 오르내린다.
 *  - 어떤 정보는 신뢰가 쌓여야만 털어놓는다 (minTrust).
 *  - 주제(topic)에 맞는 질문에만 답하고, 알 수 없는 질문에는 인물답게 되묻는다.
 *  - 신뢰도는 캠페인 다음 단계로 이월된다.
 *  - 대화는 메신저처럼 비동기다: 보낸 메시지는 상대가 읽을 때(replyDelay, 회의 일정) 답이 온다.
 */

const RUDE = /(빨리\s*(줘|내|보내)|당장|내놔|시키는\s*대로|왜\s*(그것도|이것도)|대충|그냥\s*줘요?$|필요\s*없(어|게|어지))/;
const THANKS = /(감사|고맙|수고|thank)/i;
const GREET = /^(안녕|hello|hi|처음 뵙|반갑)/i;

function rx(p: string): RegExp {
  try {
    return new RegExp(p, 'i');
  } catch {
    return new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
}

export function personPrompt(sim: Simulation, id: string): string {
  const d = sim.personDef(id);
  return d ? d.name : id;
}

// ───────────────────────────── 부재 상태 (메신저) ─────────────────────────────

export type PresenceStatus = 'online' | 'meeting';
export interface Presence {
  status: PresenceStatus;
  label: string;
  /** 이 tick에 다시 메시지를 볼 수 있다 */
  until?: number;
}

const toTick = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m - SIM_START_MINUTES;
};

export function presence(sim: Simulation, id: string, tick = sim.tick): Presence {
  const def = sim.personDef(id);
  const p = sim.people[id];
  if (!def || !p) return { status: 'online', label: '' };
  if (tick < p.awayUntil) return { status: 'meeting', label: '회의 중', until: p.awayUntil };
  for (const s of def.schedule ?? []) {
    const from = toTick(s.from);
    const to = toTick(s.to);
    if (tick >= from && tick < to) return { status: 'meeting', label: s.label, until: to };
  }
  return { status: 'online', label: '대화 가능' };
}

/** talk <id>: 메신저에서 이 사람과의 대화를 연다 (메시지는 보내지 않는다) */
export function startTalk(sim: Simulation, id: string, pane: string): boolean {
  const def = sim.personDef(id);
  const p = sim.people[id];
  if (!def || !p) {
    sim.out(pane, c.red(`✗ '${id}' 인물 없음. 'people'로 확인하세요.`));
    return false;
  }
  sim.emit('ui.request', 'open-person-pane', { personId: id, paneId: pane, data: { action: 'person-pane' } });
  sim.out(pane, c.green(`✓ 메신저에서 ${def.name} (${def.title})와의 대화를 엽니다.`));
  return true;
}

function greet(sim: Simulation, id: string) {
  const def = sim.personDef(id)!;
  const p = sim.people[id];
  p.met = true;
  sim.emit('person.said', c.dim(`── ${def.name} · ${def.title} · ${def.org} ──`), { personId: id, data: { system: true } });
  sim.personSay(id, sim.resolveLines(def.greeting));
}

export function suggestions(sim: Simulation, id: string, max = 3): string[] {
  const def = sim.personDef(id);
  const p = sim.people[id];
  if (!def || !p) return [];
  return def.topics.filter((t) => t.hint && !p.asked.includes(t.id) && sim.cond(t.requires)).slice(0, max).map((t) => t.hint!);
}

/** 메시지 보내기 — 바로 답하지 않고, 상대가 메시지를 읽을 때(readInbox) 답한다 */
function send(sim: Simulation, id: string, line: string, pane: string, msg: { topic?: string; text?: string }) {
  const def = sim.personDef(id)!;
  sim.emit('person.said', c.white(c.bold('나 ▸ ')) + c.white(line), {
    personId: id,
    paneId: pane,
    data: { from: 'player', ...(msg.topic ? { topic: msg.topic } : {}) },
  });
  if (pane !== `person:${id}`) sim.out(pane, c.dim(`→ ${def.name}에게 메시지: ${line}`));
  sim.people[id].inbox.push({ sent: sim.tick, ...msg });
}

export function handleTalk(sim: Simulation, id: string, text: string, pane: string): void {
  sim.metrics.nlInstructions++;
  send(sim, id, text, pane, { text });
}

/** 객관식 질문: ask <person> <topicId> */
export function askTopic(sim: Simulation, id: string, topicId: string, pane: string): void {
  const def = sim.personDef(id);
  const topic = def?.topics.find((t) => t.id === topicId);
  if (!def || !sim.people[id] || !topic) {
    sim.out(pane, c.red(`✗ 질문 '${topicId}' 없음`));
    return;
  }
  send(sim, id, topic.ask ?? topic.hint ?? topic.id, pane, { topic: topicId });
}

/**
 * 매 tick: 상대가 메시지를 볼 수 있으면(회의 중이 아니고 읽는 시간이 지났으면) 쌓인 메시지에 차례로 답한다.
 * 회의가 끝난 뒤 늦게 보면 한마디 덧붙인다.
 */
export function readInbox(sim: Simulation, id: string): void {
  const def = sim.personDef(id);
  const p = sim.people[id];
  if (!def || !p?.inbox.length) return;
  const delay = def.replyDelay ?? 2;
  const head = p.inbox[0];
  if (presence(sim, id).status !== 'online') return;
  if (sim.tick < head.sent + delay) return;
  // 회의 등으로 늦게 읽었으면
  const wasBusy = presence(sim, id, head.sent).status !== 'online' || sim.tick - head.sent > delay + 5;
  if (!p.met) greet(sim, id);
  else if (wasBusy) sim.personSay(id, ['아, 늦게 봤네요. 죄송해요.']);
  while (p.inbox.length) {
    if (!checkPatience(sim, id)) return; // 회의 들어감 — 남은 메시지는 회의 후에
    const m = p.inbox.shift()!;
    if (m.topic) answerTopic(sim, id, m.topic);
    else answerText(sim, id, m.text ?? '');
  }
}

/** 한 번에 받아주는 질문 수 — 넘으면 30분 회의에 들어간다 */
function checkPatience(sim: Simulation, id: string): boolean {
  const def = sim.personDef(id)!;
  const p = sim.people[id];
  if (p.lastTick !== undefined && sim.tick - p.lastTick > 20) p.visitCount = 0;
  p.lastTick = sim.tick;
  p.visitCount++;
  if (p.visitCount > (def.patience ?? 5)) {
    p.awayUntil = sim.tick + 30;
    p.visitCount = 0;
    sim.personSay(id, ['죄송한데 회의 들어가야 해서요. 남은 건 끝나고 볼게요.']);
    sim.emit('intent.matched', `대화 중단(질문 과다): ${def.name}`, { personId: id, data: { patience: true } });
    return false;
  }
  return true;
}

function answerText(sim: Simulation, id: string, text: string): void {
  const def = sim.personDef(id)!;
  const p = sim.people[id];
  const say = (lines: string[]) => sim.personSay(id, lines);

  if (RUDE.test(text)) {
    sim.changeTrust(id, -10, 'player');
    say(sim.resolveLines(def.rude ?? ['…그렇게 말씀하시면 좀 곤란하네요. 저도 하던 일이 있어서요.']));
    sim.emit('intent.matched', `무례/압박: ${def.name}`, { personId: id, data: { rude: true } });
    return;
  }

  const matched = def.topics.filter((t) => t.patterns.some((pt) => rx(pt).test(text)) && sim.cond(t.requires));
  // 아직 묻지 않은 주제 우선
  const topic: TopicDef | undefined = matched.find((t) => !p.asked.includes(t.id)) ?? matched[0];

  if (!topic) {
    if (GREET.test(text.trim()) || THANKS.test(text)) {
      say([THANKS.test(text) ? '네, 별말씀을요.' : '네, 안녕하세요. 무슨 일이세요?']);
      return;
    }
    sim.metrics.unrecognized++;
    sim.emit('intent.unrecognized', text, { personId: id });
    const fb = def.fallback[Math.floor(sim.rand() * def.fallback.length)] ?? '음… 무슨 말씀인지 잘 모르겠어요.';
    say([fb]);
    const sug = suggestions(sim, id);
    if (sug.length) sim.emit('person.said', c.dim(`  💡 질문 예: ${sug.map((x) => `"${x}"`).join(' · ')}`), { personId: id, data: { system: true } });
    return;
  }

  respondTopic(sim, id, topic);
}

function answerTopic(sim: Simulation, id: string, topicId: string): void {
  const topic = sim.personDef(id)!.topics.find((t) => t.id === topicId)!;
  if (!sim.cond(topic.requires)) {
    sim.personSay(id, ['음… 지금 그 얘기는 좀 이른 것 같은데요.']);
    return;
  }
  respondTopic(sim, id, topic);
}

function respondTopic(sim: Simulation, id: string, topic: TopicDef): void {
  const def = sim.personDef(id)!;
  const p = sim.people[id];
  const say = (lines: string[]) => sim.personSay(id, lines);
  const repeat = p.asked.includes(topic.id);
  if (topic.minTrust !== undefined && p.trust < topic.minTrust) {
    say(sim.resolveLines(topic.lowTrust ?? ['…그건 나중에 얘기하죠.']));
    sim.emit('intent.matched', `대화(보류): ${def.name} · ${topic.id}`, { personId: id, data: { topic: topic.id, deflected: true } });
    return;
  }
  if (repeat) {
    say(sim.resolveLines(topic.repeat ?? ['아까 말씀드린 그대로예요.']));
    return;
  }
  p.asked.push(topic.id);
  sim.emit('intent.matched', `대화: ${def.name} · ${topic.id}`, { personId: id, data: { topic: topic.id, quality: topic.quality ?? 'neutral' } });
  say(sim.resolveLines(topic.reply));
  if (topic.trust) sim.changeTrust(id, topic.trust, 'player');
  sim.applyEffects(topic.effects, `person:${id}`);
}

export function peopleText(sim: Simulation): string[] {
  const list = sim.scenario.people ?? [];
  if (!list.length) return [c.dim('이 미션에는 대화할 수 있는 인물이 없습니다.')];
  return [
    c.bold('사람들') + c.dim('  — 메신저 창에서 대화합니다 (talk <id> 로 열기)'),
    ...list.map((d) => {
      const p = sim.people[d.id];
      const bar = '■'.repeat(Math.round(p.trust / 10)) + '□'.repeat(10 - Math.round(p.trust / 10));
      const col = p.trust >= 60 ? c.green : p.trust >= 40 ? c.yellow : c.red;
      const pr = presence(sim, d.id);
      const st = pr.status === 'online' ? c.green('● 대화 가능') : c.red(`● ${pr.label}${pr.until !== undefined ? ` ~${formatSimTime(pr.until)}` : ''}`);
      return `  ${c.cyan(padEnd(d.id, 10))}${padEnd(d.name, 14)}${c.dim(padEnd(d.title, 26))} 신뢰 ${col(bar)} ${p.trust}  ${st}${p.met ? '' : c.dim('  (아직 연락 안 함)')}`;
    }),
  ];
}

/** 객관식으로 보여줄 질문 목록 (요건 충족 + 아직 묻지 않은 것, 고정된 섞인 순서) */
export function topicChoices(sim: Simulation, id: string): { id: string; label: string }[] {
  const def = sim.personDef(id);
  const p = sim.people[id];
  if (!def || !p) return [];
  const h = (s: string) => [...s].reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0, 7);
  return def.topics
    .filter((t) => (t.ask || t.hint) && !p.asked.includes(t.id) && !p.inbox.some((m) => m.topic === t.id) && sim.cond(t.requires))
    .map((t) => ({ id: t.id, label: (t.ask ?? t.hint)!, k: h(def.id + t.id) }))
    .sort((a, b) => a.k - b.k)
    .map(({ id: tid, label }) => ({ id: tid, label }));
}
