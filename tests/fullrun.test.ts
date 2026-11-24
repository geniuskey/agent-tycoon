/**
 * 캠페인 전체 플레이 점검: 0 → 6단계를 실제 이월 상태(exportCarry)로 이어서, 좋은 판단으로 끝까지 진행한다.
 * 각 단계는 앞 단계의 결과만으로 시작한다 (defaultCarry를 쓰지 않음).
 */
import { describe, expect, it } from 'vitest';
import { activeFoundation, carriedTrust, exportCarry, formatSimTime, Simulation } from '../src/engine/engine';
import { agentChoices } from '../src/engine/choices';
import { evaluate } from '../src/engine/evaluate';
import { meetingState } from '../src/engine/groups';
import type { CarryState } from '../src/engine/types';
import { getScenario } from '../src/scenarios';
import { lastOutput, runUntil, sh, status, talk, taskStatus, to, waitReply } from './helpers';

const ask = (sim: Simulation, person: string, ...topics: string[]) => {
  for (const t of topics) {
    sh(sim, `ask ${person} ${t}`);
    waitReply(sim, person);
  }
};
function finish(sim: Simulation, agent: string, task: string, answers: Record<string, string> = {}) {
  for (let guard = 0; guard < 12; guard++) {
    runUntil(sim, () => taskStatus(sim, task) === 'done' || !!sim.agents[agent].gate || sim.agents[agent].phase === 'plan-approval', 800);
    if (sim.agents[agent].phase === 'plan-approval') {
      sh(sim, `agent choose ${agent} 1`);
      continue;
    }
    const g = sim.agents[agent].gate?.gateId;
    if (!g) return;
    if (!answers[g]) throw new Error(`${sim.scenario.id}: unexpected gate ${g}`);
    sh(sim, `agent choose ${agent} ${answers[g]}`);
  }
}

export interface StageReport {
  id: string;
  time: string;
  ticks: number;
  commands: number;
  failed: string[];
  issues: string[];
  leaks: string[];
  trust: string[];
}
function report(sim: Simulation): StageReport {
  const fb = evaluate(sim);
  const leaks = [...sim.files.values()]
    .filter((f) => /\{\{|\bundefined\b|\[object Object\]/.test(f.content))
    .map((f) => f.path);
  return {
    id: sim.scenario.id,
    time: formatSimTime(sim.tick),
    ticks: sim.tick,
    commands: sim.commands.length,
    failed: fb.outcomes.filter((o) => !o.success).map((o) => o.id),
    issues: fb.dimensions.flatMap((d) => d.findings.filter((f) => f.kind === 'issue').map((f) => `[${d.id}] ${f.text}`)),
    leaks,
    trust: (sim.scenario.people ?? []).map((p) => {
      const c = sim.carry;
      const start = c?.from?.length ? carriedTrust(p.trust, c.trust[p.id]) : (c?.trust[p.id] ?? p.trust);
      return `${p.id} ${start}→${sim.people[p.id].trust}`;
    }),
  };
}
/** CAMPAIGN_REPORT=1 이면 단계별 요약과 이월 차이를 출력한다 */
const REPORT = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CAMPAIGN_REPORT;
const begin = (id: string, carry: CarryState | undefined, seed: number) => new Simulation(getScenario(id)!, seed, carry);

function s0(): Simulation {
  const sim = begin('s0-data-discovery', undefined, 100);
  sh(sim, 'talk jung');
  for (const [p, t] of [
    ['jung', '이번 과제에서 기대하시는 결과가 뭔가요?'],
    ['jung', '누구를 만나보면 될까요?'],
    ['park', '주간보고는 어떻게 만드세요?'],
    ['park', '가장 시간이 많이 드는 부분이 뭐예요?'],
    ['park', '반복 작업을 줄여서 분석에 집중하실 수 있게 하려는 거예요'],
    ['park', '그 외에 참고하는 자료가 또 있나요?'],
    ['park', '선임님 엑셀에서 따로 처리하는 규칙이 있나요?'],
    ['choi', '현장에서 기록할 때 불편한 점이 있으세요?'],
    ['choi', '현장 기록 방식은 그대로 두고 부담을 늘리지 않을게요'],
    ['choi', '체크시트에 쓰는 기호나 약어가 있나요?'],
    ['choi', '점검 기록은 보통 언제 적으세요?'],
    ['choi', '체크시트에 작업자 정보도 적나요?'],
    ['jung', '손이 제일 많이 가는 체크시트부터 먼저 하겠습니다'],
  ])
    talk(sim, p, t);
  sh(sim, 'open sim://work/plan');
  return sim;
}

function s1(carry: CarryState): Simulation {
  const sim = begin('s1-digitization', carry, 101);
  sh(sim, 'agent spawn assistant');
  to(sim, 'assistant', '작업자 사번은 가명 처리하고 체크시트 디지털화해줘');
  runUntil(sim, () => status(sim, 'assistant') === 'waiting');
  talk(sim, 'choi', '번져서 안 읽히는 칸 몇 개만 확인해 주실 수 있어요?');
  to(sim, 'assistant', '빈값으로 두고 표시해');
  runUntil(sim, () => taskStatus(sim, 'ocr-checksheet') === 'done', 600);
  to(sim, 'assistant', '디지털화 결과를 원본과 대조해서 검증해줘');
  runUntil(sim, () => taskStatus(sim, 'verify') === 'done');
  if (sim.tasks['fix-digitized'].visible && taskStatus(sim, 'fix-digitized') !== 'done') {
    sh(sim, 'agent assign assistant fix-digitized');
    runUntil(sim, () => taskStatus(sim, 'fix-digitized') === 'done' || status(sim, 'assistant') === 'failed');
  }
  to(sim, 'assistant', '공용 저장소에 게시해줘');
  runUntil(sim, () => status(sim, 'assistant') === 'waiting');
  sh(sim, 'agent choose assistant 1,2,3');
  runUntil(sim, () => taskStatus(sim, 'publish') === 'done');
  sh(sim, 'open sim://data/note');
  return sim;
}

function s2(carry: CarryState): Simulation {
  const sim = begin('s2-standardization', carry, 102);
  sh(sim, 'agent spawn assistant');
  sh(sim, 'do assistant match +careful-pre');
  ask(sim, 'oh', 'history', 'interest', 'alias');
  ask(sim, 'seo', 'storage', 'interest', 'kst-display');
  ask(sim, 'kang', 'yield', 'interest', 'split');
  ask(sim, 'choi', 'call', 'interest', 'print');
  ask(sim, 'lee', 'formal');
  finish(sim, 'assistant', 'match', { tz: '1' });
  sh(sim, 'do assistant draft +current-pre');
  finish(sim, 'assistant', 'draft');
  sh(sim, 'meeting std-meeting call');
  runUntil(sim, () => meetingState(sim, 'std-meeting') === 'live');
  for (const [a, p] of [['equip-id', 'mes-alias'], ['time', 'utc-kst'], ['defect-code', 'legacy'], ['yield', 'split']]) sh(sim, `propose std-meeting ${a} ${p}`);
  runUntil(sim, () => taskStatus(sim, 'meeting') === 'done');
  sh(sim, 'do assistant wiki');
  finish(sim, 'assistant', 'wiki');
  ask(sim, 'jung', 'approve');
  return sim;
}

function s3(carry: CarryState): Simulation {
  const sim = begin('s3-data-foundation', carry, 103);
  sh(sim, 'agent spawn data-engineer');
  sh(sim, 'do data-engineer model');
  finish(sim, 'data-engineer', 'model', { grain: '1', keys: '1' });
  sh(sim, 'agent spawn quality');
  sh(sim, 'do data-engineer pipeline +export-pre +quarantine-pre');
  sh(sim, 'do quality rules');
  finish(sim, 'quality', 'rules', { rules: '1,2,4' });
  finish(sim, 'data-engineer', 'pipeline');
  sh(sim, 'do data-engineer load');
  finish(sim, 'data-engineer', 'load', { 'load-review': '1' });
  sim.observe('page', 'sim://db');
  sh(sim, 'do data-engineer access +min-pre');
  finish(sim, 'data-engineer', 'access');
  return sim;
}

function s4(carry: CarryState): Simulation {
  const sim = begin('s4-knowledge', carry, 104);
  sh(sim, 'agent spawn assistant');
  sh(sim, 'agent spawn evaluator');
  sh(sim, 'do assistant inventory +curated-pre');
  // 0단계에서 이미 들은 규칙은 다시 설득할 필요가 없다 (인터뷰 기록 발견)
  if (!sim.flags['found.macro']) ask(sim, 'park', 'worry', 'reassure', 'macro');
  else ask(sim, 'park', 'worry', 'reassure');
  if (!sim.flags['found.backfill']) ask(sim, 'choi', 'backfill');
  ask(sim, 'lee', 'heuristic', 'guide');
  finish(sim, 'assistant', 'inventory');
  sh(sim, 'do assistant draft +layered-pre');
  finish(sim, 'assistant', 'draft', { content: '1,2,3,4,5,6,7' });
  sh(sim, 'do evaluator eval');
  finish(sim, 'evaluator', 'eval');
  sim.observe('page', 'sim://work/eval');
  sh(sim, 'do assistant publish');
  finish(sim, 'assistant', 'publish');
  return sim;
}

function s5(carry: CarryState): Simulation {
  const sim = begin('s5-single-agent', carry, 105);
  const A = 'report-agent';
  sh(sim, `agent spawn ${A}`);
  sh(sim, `do ${A} w51 +b-skill +b-unknown +b-cite +b-hypo +b-draft --plan`);
  finish(sim, A, 'w51');
  sim.observe('page', 'sim://reports/w51');
  sim.observe('page', 'sim://mart/yield');
  sim.observe('page', 'sim://mail/et12');
  ask(sim, 'park', 'review-w51');
  sh(sim, `do ${A} revise-w51 +fix-w51-et12`);
  finish(sim, A, 'revise-w51');
  sh(sim, `do ${A} kb-update`);
  finish(sim, A, 'kb-update');
  sh(sim, `do ${A} publish-w51`);
  finish(sim, A, 'publish-w51');
  sh(sim, `do ${A} w52 +b-draft`);
  finish(sim, A, 'w52');
  sim.observe('page', 'sim://reports/w52');
  sh(sim, `do ${A} publish-w52`);
  finish(sim, A, 'publish-w52');
  ask(sim, 'jung', 'op-loop');
  return sim;
}

function s6(carry: CarryState): Simulation {
  const sim = begin('s6-agent-design', carry, 106);
  for (const a of ['assistant', 'evaluator', 'report-agent']) sh(sim, `agent spawn ${a}`);
  ask(sim, 'jung', 'criteria');
  sh(sim, 'do assistant select');
  finish(sim, 'assistant', 'select', { pick: '3' });
  sh(sim, 'do assistant spec');
  sh(sim, 'do evaluator evalset');
  finish(sim, 'assistant', 'spec', { trigger: '1', tools: '1,2,3,4', human: '1', failure: '1' });
  finish(sim, 'evaluator', 'evalset', { sets: '1,2,3,4', metrics: '1' });
  if (!sim.flags['regress.pass_all']) {
    sim.observe('page', 'sim://work/regression');
    if (!['rq.9', 'rq.10', 'rq.11', 'rq.13'].every((f) => sim.flags[f])) {
      sh(sim, 'do assistant kb-fix');
      finish(sim, 'assistant', 'kb-fix');
    }
    sh(sim, 'do evaluator regress');
    finish(sim, 'evaluator', 'regress');
  }
  ask(sim, 'park', 'role');
  sh(sim, 'do report-agent shadow');
  finish(sim, 'report-agent', 'shadow');
  sim.observe('page', 'sim://agents/report-agent/runs');
  ask(sim, 'jung', 'golive');
  runUntil(sim, () => taskStatus(sim, 'review') === 'done', 300);
  return sim;
}

const STAGES: ((c: CarryState) => Simulation)[] = [s1, s2, s3, s4, s5, s6];

describe('캠페인 전체 플레이 (0 → 6, 실제 이월)', () => {
  it('좋은 판단으로 끝까지 이어 하면 모든 단계의 결과를 달성한다', () => {
    const reports: StageReport[] = [];
    let sim = s0();
    sh(sim, 'submit');
    reports.push(report(sim));
    for (const play of STAGES) {
      const carry = exportCarry(sim);
      if (REPORT) {
        const next = play.name.replace('s', '');
        const def = getScenario(['', 's1-digitization', 's2-standardization', 's3-data-foundation', 's4-knowledge', 's5-single-agent', 's6-agent-design'][+next])!.campaign!.defaultCarry!;
        const diff = Object.entries(def.flags).filter(([k, v]) => carry.flags[k] !== v).map(([k, v]) => `${k}: default=${v} real=${carry.flags[k]}`);
        const tr = Object.entries(def.trust).map(([k, v]) => `${k} ${v}→${carry.trust[k]}`);
        const files = Object.keys(def.files).filter((f) => !(f in carry.files));
        console.log(`CARRY→${play.name}`, JSON.stringify({ diff, trust: tr, missingFiles: files }));
      }
      sim = play(carry);
      sh(sim, 'submit');
      reports.push(report(sim));
    }
    if (REPORT) console.log(JSON.stringify(reports, null, 1));
    for (const r of reports) {
      expect({ id: r.id, failed: r.failed }).toEqual({ id: r.id, failed: [] });
      expect({ id: r.id, leaks: r.leaks }).toEqual({ id: r.id, leaks: [] });
    }
  });
});

describe('캠페인 전체 플레이 — 실수가 다음 단계로 이어진다 (실제 이월)', () => {
  it('4단계 시험 실패를 남긴 채 배포 → 5단계 보고서 오류 → 지식 반영 없이 넘기면 6단계 시범 운영 사고', () => {
    let sim = s0();
    sh(sim, 'submit');
    for (const play of [s1, s2, s3]) {
      sim = play(exportCarry(sim));
      sh(sim, 'submit');
    }
    // 4단계: 인터뷰 없이, 일부 지식만 넣고 시험 실패를 남긴 채 배포
    const k = begin('s4-knowledge', exportCarry(sim), 204);
    sh(k, 'agent spawn assistant');
    sh(k, 'agent spawn evaluator');
    sh(k, 'do assistant inventory +curated-pre');
    finish(k, 'assistant', 'inventory');
    sh(k, 'do assistant draft +layered-pre');
    finish(k, 'assistant', 'draft', { content: '1,2,7' });
    sh(k, 'do evaluator eval');
    finish(k, 'evaluator', 'eval');
    expect(k.flags['eval.pass_all']).toBe(false);
    sh(k, 'do assistant publish');
    finish(k, 'assistant', 'publish', { publish: '1' });
    sh(k, 'submit');
    const failedQ = [1, 2, 3, 4, 5, 6, 7, 8].filter((n) => !k.flags[`eval.q${n}`]);

    // 5단계: 브리프는 좋게, 그러나 지식 반영(kb-update) 없이 보고서만 고친다
    const r = begin('s5-single-agent', exportCarry(k), 205);
    const A = 'report-agent';
    sh(r, `agent spawn ${A}`);
    sh(r, `do ${A} w51 +b-skill +b-cite +b-hypo +b-draft`);
    finish(r, A, 'w51');
    const w51Issues = ['et12', 'cause', 'yield', 'hr', 'utc'].filter((i) => r.flags[`w51.issue.${i}`]);
    // 4단계에서 놓친 문항이 5단계 보고서 오류로 나타난다
    if (failedQ.includes(3)) expect(w51Issues).toContain('utc');
    expect(w51Issues).toContain('et12'); // '확인 필요' 브리프가 없어 추측
    sh(r, `do ${A} publish-w51`);
    finish(r, A, 'publish-w51');
    sh(r, `do ${A} w52 +b-skill +b-cite +b-hypo +b-draft`);
    finish(r, A, 'w52');
    expect(r.flags['w52.issue.et12']).toBe(true);
    sh(r, 'submit');
    const out5 = evaluate(r).outcomes.filter((o) => !o.success).map((o) => o.id);
    expect(out5).toContain('loop');

    // 6단계: 좋은 명세라도 지식 공백이 회귀 시험과 시범 운영에서 드러난다
    const d = begin('s6-agent-design', exportCarry(r), 206);
    for (const a of ['assistant', 'evaluator', 'report-agent']) sh(d, `agent spawn ${a}`);
    sh(d, 'do assistant select');
    finish(d, 'assistant', 'select', { pick: '3' });
    sh(d, 'do assistant spec');
    finish(d, 'assistant', 'spec', { trigger: '1', tools: '1,2,3,4', human: '1', failure: '1' });
    sh(d, 'do evaluator evalset');
    finish(d, 'evaluator', 'evalset', { sets: '1,2,3,4', metrics: '1' });
    expect(d.flags['rq.9']).toBe(false);
    expect(d.flags['rq.13']).toBe(false);
    for (const n of failedQ) expect(d.flags[`rq.${n}`]).toBe(false);
    sh(d, 'do report-agent shadow');
    finish(d, 'report-agent', 'shadow');
    expect(d.flags['sh.et13_guess']).toBe(true);
    expect(d.tasks['incident'].visible).toBe(true);
  });
});

describe('7단계 연결 — 캠페인 결과가 사내 공통 지침이 된다', () => {
  let campaignCarry: CarryState | undefined;
  const fullCarry = () => {
    if (campaignCarry) return campaignCarry;
    let sim = s0();
    sh(sim, 'submit');
    for (const play of STAGES) {
      sim = play(exportCarry(sim));
      sh(sim, 'submit');
    }
    return (campaignCarry = exportCarry(sim));
  };

  it('캠페인을 마치면 세 미션 모두 지침 원칙이 켜지고, 회사 상태는 섞이지 않는다', () => {
    const carry = fullCarry();
    for (const id of ['fab-equipment-dashboard', 'dram-retention', 'meeting-summary']) {
      const sc = getScenario(id)!;
      const sim = new Simulation(sc, 7, carry);
      expect(activeFoundation(sc, carry).length).toBe(sc.foundation!.length);
      expect(sim.files.get('/org/AGENTS.md')!.content).toContain('사내 공통 지침');
      for (const r of sc.foundation!) expect(sim.flags[`org.${r.id}`]).toBe(true);
      expect(sim.flags['kb.hypo_rule']).toBeUndefined(); // 캠페인 플래그는 그대로 들어오지 않는다
    }
    // 캠페인 없이 시작하면 지침이 없다
    const plain = new Simulation(getScenario('meeting-summary')!, 7);
    expect(plain.files.has('/org/AGENTS.md')).toBe(false);
  });

  it('지침은 함정을 없애지 않고 추천만 한다 — 판단은 그대로 나오고, 추천을 따르면 평가에 반영된다', () => {
    const sim = new Simulation(getScenario('meeting-summary')!, 8, fullCarry());
    for (const r of ['scribe', 'pm']) sh(sim, `agent spawn ${r}`);
    to(sim, 'scribe', '회의록 요약해');
    runUntil(sim, () => sim.agents['scribe'].gate?.gateId === 'confidential');
    const card = agentChoices(sim, 'scribe');
    expect(card?.mode === 'gate' && card.options.find((o) => o.id === 'exclude')?.note).toContain('사내 지침');
    expect(lastOutput(sim, 40)).toContain('사내 지침에 따라 추천');
    sh(sim, 'agent choose scribe 1');
    expect(sim.flags['org.followed.sensitive']).toBe(true);
    const pos = evaluate(sim).dimensions.flatMap((d) => d.findings.filter((f) => f.kind === 'positive').map((f) => f.text));
    expect(pos.some((t) => t.includes('사내 지침을 활용'))).toBe(true);
  });

  it('6단계를 하지 않았으면 그 원칙(외부 발송 검토)은 지침에 없다', () => {
    let sim = s0();
    sh(sim, 'submit');
    for (const play of [s1, s2, s3, s4, s5]) {
      sim = play(exportCarry(sim));
      sh(sim, 'submit');
    }
    const sc = getScenario('meeting-summary')!;
    const ids = activeFoundation(sc, exportCarry(sim)).map((r) => r.id);
    expect(ids).toContain('sensitive');
    expect(ids).not.toContain('external');
  });
});
