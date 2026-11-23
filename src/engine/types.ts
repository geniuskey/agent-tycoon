/**
 * Agent Tycoon — 시뮬레이션 데이터 모델
 *
 * 1) Scenario*  : 시나리오 정의(JSON). 코드 수정 없이 추가 가능한 데이터.
 * 2) *Runtime   : 엔진이 실행 중 유지하는 상태.
 * 3) SimEvent   : 모든 상태 변화는 이벤트로 기록된다(이력/재생/평가의 근거).
 * 4) PlayerCommand : 플레이어 입력. (scenario, seed, commands) → 결정적 결과.
 */

// ───────────────────────────── Conditions ─────────────────────────────

export type FlagValue = string | number | boolean | null;

/**
 * 조건식.
 *  - "flag"        : flag가 truthy
 *  - "!flag"       : flag가 falsy
 *  - { flag, eq }  : flag === eq
 *  - { all } / { any } / { not }
 *  - { taskDone }  : 해당 task 완료
 *  - { taskStatus, is }
 *  - { fileExists }
 *  - { gate, chose } : 해당 gate에서 특정 option 선택
 */
export type Cond =
  | string
  | { flag: string; eq?: FlagValue }
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond }
  | { taskDone: string }
  | { taskStatus: string; is: TaskStatus | TaskStatus[] }
  | { fileExists: string }
  | { gate: string; chose: string | string[] }
  | { trust: string; gte?: number; lt?: number }
  /** 플레이어가 해당 화면(sim://…) 또는 파일을 직접 열어본 적이 있음 */
  | { observed: string };

// ───────────────────────────── Effects ─────────────────────────────

export interface ContentVariant {
  when: Cond;
  content?: string;
  src?: string;
}

/** 모든 Effect는 when 조건을 가질 수 있다 (거짓이면 무시) */
export type Effect = { when?: Cond } & (
  | { type: 'writeFile'; path: string; content?: string; src?: string; variants?: ContentVariant[] }
  | { type: 'deleteFile'; path: string }
  | { type: 'setFlag'; flag: string; value?: FlagValue }
  | { type: 'notify'; level?: NotifyLevel; message: string }
  | { type: 'activateTask'; task: string }
  | { type: 'reopenTask'; task: string }
  | { type: 'trust'; person: string; delta: number }
);

export type NotifyLevel = 'info' | 'warn' | 'error' | 'success';

/** 로그 라인: 문자열 또는 조건부 라인 */
export type LogLine = string | { when: Cond; text: string };

// ───────────────────────────── Scenario ─────────────────────────────

export interface RoleDef {
  id: string;
  name: string;
  title: string;
  skills: string[];
  description: string;
}

export interface GateOption {
  id: string;
  label: string;
  /** 자연어 매칭 정규식(대소문자 무시) */
  patterns: string[];
  effects?: Effect[];
  log?: LogLine[];
  /** 학습 피드백용 판단 품질 */
  quality?: 'good' | 'bad' | 'neutral';
  feedback?: string;
  /** 피드백이 반영될 평가 항목 (기본: recovery) */
  dimension?: DimensionId;
}

export interface GateDef {
  id: string;
  /** waiting: 의사결정 필요 / blocked: 권한·외부 요인으로 진행 불가 */
  kind: 'waiting' | 'blocked';
  when?: Cond;
  title: string;
  prompt: LogLine[];
  options: GateOption[];
  /**
   * 도구 실행 승인 프롬프트로 표시 — Agent가 실행하려는 도구 호출 (예: "Bash(psql -h mes-prod-db …)").
   * 위험한 실행(운영 DB 접속, 외부 발송, 권한 밖 파일)을 사람이 승인/거절하는 장면.
   */
  tool?: string;
  /** 복수 선택 (체크박스). 선택한 모든 선택지의 효과가 적용된다 */
  multi?: boolean;
  min?: number;
  max?: number;
}

export interface StepDef {
  id: string;
  /** 이벤트 라벨 (예: "Data validated") */
  event: string;
  ticks?: number | [number, number];
  when?: Cond;
  log?: LogLine[];
  reads?: string[];
  effects?: Effect[];
  gate?: GateDef;
  fail?: { when: Cond; message: string; log?: LogLine[]; hint?: string };
}

export interface TaskDef {
  id: string;
  title: string;
  description: string;
  type: string;
  skills: string[];
  dependsOn?: string[];
  /** 처음에는 보이지 않다가 activateTask 효과로 등장 (수정/재작업 task) */
  hidden?: boolean;
  /** 완료 조건에 필수가 아님 */
  optional?: boolean;
  /** 리뷰/검증 task 여부 (Agent 상태가 Reviewing으로 표시됨) */
  review?: boolean;
  keywords?: string[];
  /**
   * 'player' = 사람이 직접 하는 업무 (사전 조율·회의·승인). Agent에게 배정할 수 없고,
   * completeWhen 조건이 참이 되면 완료된다.
   */
  owner?: 'player';
  completeWhen?: Cond;
  inputs?: string[];
  outputs?: string[];
  steps: StepDef[];
  onComplete?: Effect[];
}

export interface IntentDef {
  id: string;
  patterns: string[];
  /** 지시 대상 Agent role 제한 (없으면 모두) */
  roles?: string[];
  requires?: Cond;
  deniedReply?: string[];
  /** 객관식 선택지에 표시할 지시 문장 (없으면 example에서 생성) */
  label?: string;
  /** 객관식 선택지에 노출하지 않음 (자유 입력으로만 인식) */
  hiddenChoice?: boolean;
  /** 대상 Agent에게 배정할 task */
  assign?: string;
  /** 이미 완료된 task라도 다시 수행 (예: 수정 후 재테스트) */
  redo?: boolean;
  effects?: Effect[];
  reply?: LogLine[];
  /** 학습 피드백용 */
  quality?: 'good' | 'bad' | 'neutral';
  /** 도움말에 노출할 예시 문장 */
  example?: string;
  /**
   * 수식어 intent: 효과(조건 지시)만 적용하고 다른 intent 매칭을 계속한다.
   * 예) "원인은 단정하지 말고(modifier) 패턴을 분석해(primary)"
   */
  modifier?: boolean;
}

// ───────────────────────────── People (가상 인물) ─────────────────────────────

/** 인물에게 물어볼 수 있는 주제. 질문이 패턴에 맞으면 응답한다. */
export interface TopicDef {
  id: string;
  patterns: string[];
  requires?: Cond;
  /** 이 신뢰도 미만이면 lowTrust로 얼버무린다 */
  minTrust?: number;
  lowTrust?: LogLine[];
  reply: LogLine[];
  effects?: Effect[];
  /** 신뢰도 변화 (첫 응답 시) */
  trust?: number;
  /** 같은 주제를 다시 물었을 때 (기본: 짧게 반복) */
  repeat?: LogLine[];
  /** 대화 중 '질문 예'로 노출할 문장 */
  hint?: string;
  /** 객관식 선택지로 표시할 플레이어의 질문/발언 (없으면 hint) */
  ask?: string;
  /** 여러 번 물을 수 있다 (예: '다시 승인 요청') — 물을 때마다 reply와 effects가 다시 적용된다 */
  repeatable?: boolean;
  quality?: 'good' | 'bad' | 'neutral';
}

export interface PersonDef {
  id: string;
  name: string;
  title: string;
  org: string;
  /** 초기 신뢰도 0–100 */
  trust: number;
  description: string;
  greeting: LogLine[];
  fallback: string[];
  /** 무례/압박성 발언 반응 */
  rude?: LogLine[];
  /** 한 번에 받아주는 질문 수 (기본 5). 넘으면 30분간 회의에 들어가고, 그동안 온 메시지는 나중에 확인한다 */
  patience?: number;
  /** 메시지를 읽기까지 걸리는 시간 (tick, 기본 2). 현장 근무자는 메신저를 자주 못 본다 */
  replyDelay?: number;
  /** 고정 일정 — 이 시간에는 메시지를 읽지 않는다 ("HH:MM" 업무 시각) */
  schedule?: { from: string; to: string; label: string }[];
  topics: TopicDef[];
}

export interface PersonRuntime {
  id: string;
  trust: number;
  met: boolean;
  asked: string[];
  /** 이번 대화에서 받은 질문 수 */
  visitCount: number;
  /** 이 tick까지 회의 중 (인내심 초과) */
  awayUntil: number;
  lastTick?: number;
  pending: PendingLog[];
  /** 아직 읽지 않은 메시지 — 읽을 수 있게 되면 순서대로 답한다 */
  inbox: InboxMessage[];
}

export interface InboxMessage {
  /** 보낸 tick */
  sent: number;
  /** 객관식 질문 */
  topic?: string;
  /** 자유 입력 */
  text?: string;
}

// ───────────────────────────── Groups (그룹 대화방·회의) ─────────────────────────────

/** 안건 제안에 대한 참석자 반응 — 위에서부터 when이 참인 첫 반응을 쓴다 */
export interface ReactionDef {
  member: string;
  when?: Cond;
  agree: boolean;
  say: LogLine[];
  /** 이 반응이 나올 때 신뢰 변화 */
  trust?: number;
}

export interface ProposalDef {
  id: string;
  label: string;
  /** 참석자 반응. 반응이 정의되지 않은 참석자는 조용히 동의한다 */
  reactions: ReactionDef[];
  /** 합의되면 적용 */
  effects?: Effect[];
  quality?: 'good' | 'bad' | 'neutral';
  feedback?: string;
  dimension?: DimensionId;
  requires?: Cond;
}

export interface AgendaDef {
  id: string;
  title: string;
  /** 안건 설명 (비전공자를 위한 배경) */
  explain?: string;
  proposals: ProposalDef[];
}

export interface GroupDef {
  id: string;
  name: string;
  description: string;
  members: string[];
  /** 회의 소집 후 시작까지 (tick, 기본 15) */
  notice?: number;
  /** 회의가 열릴 때 진행자(플레이어) 안내 */
  opening?: LogLine[];
  agenda: AgendaDef[];
  /** 회의가 시작될 때마다 (예: 사전 조율 여부 기록) */
  onStart?: Effect[];
  /** 모든 안건 합의 시 */
  onSigned?: Effect[];
  /** 조건이 거짓이면 회의를 소집할 수 없다 */
  requires?: Cond;
  /** 소집할 수 없을 때 안내 */
  requiresText?: string;
}

export interface AgendaRuntime {
  status: 'open' | 'agreed' | 'held';
  proposal?: string;
  attempts: number;
}

export interface GroupRuntime {
  id: string;
  /** 소집된 회의 시작 tick (없으면 회의 없음) */
  start?: number;
  /** 이번 회의에서 다룬 안건 — 남은 안건을 모두 다루면 회의가 끝난다 */
  discussed: string[];
  /** 남은 발언이 끝나면 회의 종료 */
  closing?: boolean;
  meetings: number;
  agenda: Record<string, AgendaRuntime>;
  signed: boolean;
  pending: (PendingLog & { speaker?: string; system?: boolean })[];
}

// ───────────────────────────── Campaign ─────────────────────────────

/** 이전 미션에서 다음 미션으로 이어지는 회사 상태 */
export interface CarryState {
  flags: Record<string, FlagValue>;
  files: Record<string, string>;
  trust: Record<string, number>;
  from?: string[];
}

export interface ScenarioCampaign {
  id: string;
  stage: number;
  order?: number;
  /** 선행 미션 (scenario id) */
  requires?: string[];
  /** 다음 미션으로 넘길 것: flag 접두어, 파일 경로, 신뢰도 */
  carry?: { flags?: string[]; files?: string[]; trust?: boolean };
  /** 선행 미션 없이 시작할 때 사용하는 기본 이월 상태 */
  defaultCarry?: CarryState;
}

export interface PageDef {
  url: string;
  title: string;
  view: 'markdown' | 'dashboard' | 'table' | 'mail' | 'text' | 'scan' | 'db' | 'eval';
  source: string;
  description?: string;
}

export type DimensionId =
  | 'decomposition'
  | 'assignment'
  | 'parallelism'
  | 'verification'
  | 'recovery'
  | 'duplication'
  | 'domain'
  | 'evidence'
  | 'security'
  | 'collaboration';

export interface EvalRule {
  dimension: DimensionId;
  when: Cond;
  kind: 'positive' | 'issue';
  text: string;
  suggestion?: string;
}

export interface OutcomeDef {
  id: string;
  label: string;
  success: Cond;
  successText: string;
  failText: string;
}

export interface FileDef {
  content?: string;
  src?: string;
  restricted?: boolean;
  description?: string;
}

export interface ScenarioDef {
  id: string;
  version: number;
  title: string;
  domain: string;
  function: string;
  taskType: string;
  difficulty: 1 | 2 | 3;
  estMinutes: number;
  tags?: string[];
  company: { name: string; org: string };
  briefing: {
    requester: { name: string; role: string };
    title: string;
    background: string;
    goal: string;
    completionCriteria: string[];
    deliverables: string[];
    constraints?: string[];
  };
  learningObjectives: string[];
  roles: RoleDef[];
  people?: PersonDef[];
  groups?: GroupDef[];
  campaign?: ScenarioCampaign;
  files: Record<string, FileDef>;
  pages: PageDef[];
  tasks: TaskDef[];
  intents: IntentDef[];
  evaluation: EvalRule[];
  outcomes: OutcomeDef[];
  hints: { when?: Cond; text: string }[];
  /** 시나리오 시작 시 설정되는 flag */
  initialFlags?: Record<string, FlagValue>;
}

/** 로더가 assets(src 참조)를 해석한 시나리오 */
export interface LoadedScenario extends ScenarioDef {
  assets: Record<string, string>;
}

// ───────────────────────────── Runtime ─────────────────────────────

export type AgentStatus =
  | 'idle'
  | 'planning'
  | 'working'
  | 'waiting'
  | 'blocked'
  | 'reviewing'
  | 'failed'
  | 'completed'
  | 'interrupted';

export type TaskStatus = 'locked' | 'ready' | 'assigned' | 'in_progress' | 'waiting' | 'blocked' | 'done' | 'failed';

export interface PendingLog {
  at: number;
  text: string;
}

export interface AgentRuntime {
  id: string;
  role: string;
  status: AgentStatus;
  /** interrupted 이전 상태 (resume 시 복원) */
  prevStatus?: AgentStatus;
  taskId?: string;
  /** -1 = planning phase */
  phase: 'none' | 'planning' | 'step' | 'gate' | 'waiting-deps' | 'confirm-mismatch' | 'plan-approval';
  /** plan mode로 지시받음 — 계획만 세우고 승인을 기다린다 */
  planMode?: boolean;
  stepTick: number;
  stepTicks: number;
  pending: PendingLog[];
  gate?: { taskId: string; stepId: string; gateId: string };
  context: string[];
  completedTasks: string[];
  mismatch: boolean;
  error?: string;
  spawnedAt: number;
  lastActiveTick: number;
  busyTicks: number;
}

export interface TaskRuntime {
  id: string;
  status: TaskStatus;
  visible: boolean;
  assignee?: string;
  stepIndex: number;
  attempts: number;
  startedAt?: number;
  completedAt?: number;
  assignHistory: string[];
}

export interface FileVersion {
  content: string;
  tick: number;
  by: string;
}

export interface VFile {
  path: string;
  content: string;
  restricted: boolean;
  createdBy: string;
  versions: FileVersion[];
  description?: string;
}

export type EventType =
  | 'session.start'
  | 'command'
  | 'observe'
  | 'cli.output'
  | 'agent.spawned'
  | 'agent.removed'
  | 'agent.status'
  | 'agent.log'
  | 'agent.message'
  | 'task.status'
  | 'task.assigned'
  | 'task.activated'
  | 'step.started'
  | 'step.completed'
  | 'gate.opened'
  | 'gate.resolved'
  | 'plan.presented'
  | 'plan.resolved'
  | 'group.said'
  | 'group.meeting'
  | 'group.agenda'
  | 'file.created'
  | 'file.updated'
  | 'file.deleted'
  | 'flag.set'
  | 'notify'
  | 'intent.matched'
  | 'intent.unrecognized'
  | 'security.denied'
  | 'ui.request'
  | 'session.submitted'
  | 'person.said'
  | 'person.trust';

export interface SimEvent {
  seq: number;
  tick: number;
  type: EventType;
  agentId?: string;
  personId?: string;
  taskId?: string;
  paneId?: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface PlayerCommand {
  tick: number;
  kind: 'input' | 'observe';
  paneId: string;
  /** Agent 전용 패널에서 입력했을 때의 대상 Agent */
  agentId?: string;
  /** 대화 패널에서 입력했을 때의 대상 인물 */
  personId?: string;
  text: string;
}

export interface Metrics {
  maxConcurrent: number;
  /** 준비된(ready) task가 있는데 다른 Agent만 일하던 tick 수 */
  missedParallelTicks: number;
  /** 2개 이상 Agent가 동시에 일한 tick 수 */
  parallelTicks: number;
  busyTicks: number;
  unrecognized: number;
  commands: number;
  nlInstructions: number;
}
