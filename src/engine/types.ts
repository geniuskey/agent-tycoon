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
  | { gate: string; chose: string | string[] };

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

export interface PageDef {
  url: string;
  title: string;
  view: 'markdown' | 'dashboard' | 'table' | 'mail' | 'text';
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
  | 'security';

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
  phase: 'none' | 'planning' | 'step' | 'gate' | 'waiting-deps' | 'confirm-mismatch';
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
  | 'file.created'
  | 'file.updated'
  | 'file.deleted'
  | 'flag.set'
  | 'notify'
  | 'intent.matched'
  | 'intent.unrecognized'
  | 'security.denied'
  | 'ui.request'
  | 'session.submitted';

export interface SimEvent {
  seq: number;
  tick: number;
  type: EventType;
  agentId?: string;
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
