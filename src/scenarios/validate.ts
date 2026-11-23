import type { Cond, Effect, LoadedScenario } from '../engine/types';

/**
 * 시나리오 정적 검증기. 시나리오 제작 시 `npm run validate:scenarios` 로 실행된다.
 * 참조 무결성(Task, 파일, asset, gate), DAG 순환, 정규식 유효성, 템플릿 문법을 확인한다.
 */
export function validateScenario(s: LoadedScenario): string[] {
  const errs: string[] = [];
  const e = (m: string) => errs.push(`[${s.id}] ${m}`);
  const taskIds = new Set(s.tasks.map((t) => t.id));
  const roleIds = new Set(s.roles.map((r) => r.id));
  const skills = new Set(s.roles.flatMap((r) => r.skills));
  const gateIds = new Set<string>();
  const personIds = new Set((s.people ?? []).map((p) => p.id));

  for (const k of ['id', 'title', 'domain', 'function', 'taskType'] as const) if (!s[k]) e(`필수 필드 누락: ${k}`);
  if (!s.roles.length) e('roles 비어 있음');
  if (!s.tasks.length) e('tasks 비어 있음');
  if (!s.outcomes.length) e('outcomes 비어 있음');

  const checkAsset = (src: string | undefined, where: string) => {
    if (src !== undefined && !(src in s.assets)) e(`${where}: asset '${src}' 없음`);
  };
  const checkTemplate = (text: string, where: string) => {
    const opens = (text.match(/\{\{#if /g) ?? []).length;
    const closes = (text.match(/\{\{\/if\}\}/g) ?? []).length;
    if (opens !== closes) e(`${where}: {{#if}} ${opens}개 / {{/if}} ${closes}개 불일치`);
  };
  const checkCond = (c: Cond | undefined, where: string) => {
    if (c === undefined || typeof c === 'string') return;
    if ('all' in c) c.all.forEach((x) => checkCond(x, where));
    else if ('any' in c) c.any.forEach((x) => checkCond(x, where));
    else if ('not' in c) checkCond(c.not, where);
    else if ('taskDone' in c && !taskIds.has(c.taskDone)) e(`${where}: 조건의 task '${c.taskDone}' 없음`);
    else if ('taskStatus' in c && !taskIds.has(c.taskStatus)) e(`${where}: 조건의 task '${c.taskStatus}' 없음`);
    else if ('trust' in c && !personIds.has(c.trust)) e(`${where}: 조건의 인물 '${c.trust}' 없음`);
  };
  const checkEffects = (effs: Effect[] | undefined, where: string) => {
    for (const ef of effs ?? []) {
      checkCond(ef.when, where);
      if (ef.type === 'writeFile') {
        checkAsset(ef.src, where);
        ef.variants?.forEach((v) => {
          checkAsset(v.src, where);
          checkCond(v.when, where);
        });
        if (ef.src === undefined && ef.content === undefined && !ef.variants?.length) e(`${where}: writeFile 내용 없음`);
      }
      if ((ef.type === 'activateTask' || ef.type === 'reopenTask') && !taskIds.has(ef.task)) e(`${where}: task '${ef.task}' 없음`);
      if (ef.type === 'trust' && !personIds.has(ef.person)) e(`${where}: 인물 '${ef.person}' 없음`);
    }
  };
  const checkRegex = (p: string, where: string) => {
    try {
      new RegExp(p, 'i');
    } catch {
      e(`${where}: 잘못된 정규식 ${p}`);
    }
  };

  for (const [path, f] of Object.entries(s.files)) {
    if (!path.startsWith('/')) e(`파일 경로는 /로 시작해야 함: ${path}`);
    checkAsset(f.src, `files[${path}]`);
  }
  for (const [name, content] of Object.entries(s.assets)) checkTemplate(content, `asset ${name}`);

  for (const t of s.tasks) {
    const w = `task ${t.id}`;
    for (const d of t.dependsOn ?? []) if (!taskIds.has(d)) e(`${w}: 선행 task '${d}' 없음`);
    if (!t.steps.length) e(`${w}: steps 비어 있음`);
    if (!t.skills.some((sk) => skills.has(sk))) e(`${w}: 어떤 role도 필요 역량(${t.skills.join(',')})을 갖고 있지 않음`);
    if (!s.roles.some((r) => t.skills.every((sk) => r.skills.includes(sk)))) e(`${w}: 모든 역량을 갖춘 role이 없음 (항상 역량 부족 경고)`);
    const stepIds = new Set<string>();
    for (const st of t.steps) {
      if (stepIds.has(st.id)) e(`${w}: 중복 step id ${st.id}`);
      stepIds.add(st.id);
      checkCond(st.when, `${w}.${st.id}`);
      checkEffects(st.effects, `${w}.${st.id}`);
      if (st.fail) checkCond(st.fail.when, `${w}.${st.id}.fail`);
      if (st.gate) {
        if (gateIds.has(st.gate.id)) e(`gate id 중복: ${st.gate.id}`);
        gateIds.add(st.gate.id);
        if (st.gate.options.length < 2) e(`gate ${st.gate.id}: 선택지는 2개 이상`);
        for (const o of st.gate.options) {
          o.patterns.forEach((p) => checkRegex(p, `gate ${st.gate!.id}.${o.id}`));
          checkEffects(o.effects, `gate ${st.gate.id}.${o.id}`);
        }
      }
    }
    checkEffects(t.onComplete, `${w}.onComplete`);
  }

  // DAG 순환 검사
  const state: Record<string, 0 | 1 | 2> = {};
  const visit = (id: string, path: string[]): void => {
    if (state[id] === 2) return;
    if (state[id] === 1) {
      e(`의존성 순환: ${[...path, id].join(' → ')}`);
      return;
    }
    state[id] = 1;
    for (const d of s.tasks.find((t) => t.id === id)?.dependsOn ?? []) visit(d, [...path, id]);
    state[id] = 2;
  };
  s.tasks.forEach((t) => visit(t.id, []));

  for (const i of s.intents) {
    i.patterns.forEach((p) => checkRegex(p, `intent ${i.id}`));
    if (i.assign && !taskIds.has(i.assign)) e(`intent ${i.id}: task '${i.assign}' 없음`);
    i.roles?.forEach((r) => roleIds.has(r) || e(`intent ${i.id}: role '${r}' 없음`));
    checkCond(i.requires, `intent ${i.id}`);
    checkEffects(i.effects, `intent ${i.id}`);
  }
  for (const p of s.people ?? []) {
    if (p.trust < 0 || p.trust > 100) e(`person ${p.id}: trust는 0–100`);
    const topicIds = new Set<string>();
    for (const t of p.topics) {
      if (topicIds.has(t.id)) e(`person ${p.id}: 중복 topic ${t.id}`);
      topicIds.add(t.id);
      t.patterns.forEach((pt) => checkRegex(pt, `person ${p.id}.${t.id}`));
      checkCond(t.requires, `person ${p.id}.${t.id}`);
      checkEffects(t.effects, `person ${p.id}.${t.id}`);
    }
  }
  for (const p of s.pages) {
    if (!p.url.startsWith('sim://')) e(`page url은 sim:// 로 시작: ${p.url}`);
  }
  for (const o of s.outcomes) checkCond(o.success, `outcome ${o.id}`);
  for (const r of s.evaluation) checkCond(r.when, `evaluation ${r.text.slice(0, 20)}`);
  if (!s.tasks.some((t) => !t.hidden)) e('보이는 task가 없음');
  return errs;
}
