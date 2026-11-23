# Architecture

Agent Tycoon은 **백엔드 없는 정적 웹앱**이다. 실제 LLM/AI API를 호출하지 않고, 결정적(deterministic) 상태 기반 이벤트 시뮬레이션 엔진이 AI Agent의 행동을 재현한다.

```
┌──────────────────────────────── Browser (정적 번들, 외부 네트워크 없음) ────────────────────────────────┐
│                                                                                                          │
│  UI (React)                                         Store (Zustand)              Persistence             │
│  ├─ Home / 시나리오 탐색                             session.ts                   persist.ts               │
│  ├─ Workspace                                        - Simulation 인스턴스         IndexedDB (fallback      │
│  │   ├─ Sidebar (Task DAG, Agent 상태)               - 패널 레이아웃               localStorage)            │
│  │   ├─ TerminalGrid ─ xterm.js 패널들 ◄─ 이벤트 투영  - 브라우저 히스토리          {scenarioId, seed,       │
│  │   ├─ Browser (sim:// 가상 페이지)  ◄─ VFS 렌더링    - 클럭(tick) 구동             commands[], tick}       │
│  │   ├─ Files / Preview (버전·diff)                                                                     │
│  │   └─ Timeline (Gantt / 알림 / 이벤트 로그)                                                           │
│  └─ Feedback (학습 피드백 / 작업 이력 복기)                                                              │
│                         │ input(text) / observe() / step()                                                │
│                         ▼                                                                                │
│  Engine (순수 TypeScript, DOM 의존 없음)                                                                 │
│  ├─ engine.ts    Simulation: tick 상태 전이, Agent/Task 런타임, Effects, VFS, 이벤트 로그, replay()        │
│  ├─ cli.ts       가상 CLI 파서/실행기 (agent/task/ls/cat/diff/open/submit …), 자동완성                    │
│  ├─ nlu.ts       규칙 기반 자연어 의도 분류 (gate 응답 → 시나리오 intent → 공통 intent → 키워드 → 안내)     │
│  ├─ evaluate.ts  9개 학습 차원 피드백 + 시나리오 결과(outcome) 판정                                       │
│  ├─ conditions.ts 조건식 평가 · rng.ts 시드 난수 · csv.ts · ansi.ts                                       │
│  └─ types.ts     시나리오 스키마 · 런타임 상태 · 이벤트 타입                                              │
│                         ▲                                                                                │
│  Scenarios (데이터)     │ import.meta.glob (빌드 시 번들)                                                │
│  src/scenarios/<id>/scenario.json + assets/*   ·  catalog.json (준비 중 시나리오)  ·  validate.ts         │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 핵심 설계 원칙

### 1. 결정성 (재현 가능성)

- `Simulation`은 `(scenario, seed)`로 생성되고, 모든 플레이어 입력은 `PlayerCommand { tick, kind, paneId, agentId, text }`로 기록된다.
- 난수는 `Rng(seed)`(mulberry32)만 사용한다. `Math.random`, `Date.now`는 엔진에서 사용하지 않는다.
- `replay(scenario, seed, commands, untilTick)`은 tick 0부터 명령을 해당 tick에 적용하며 다시 실행한다. 같은 입력이면 이벤트·파일·flag가 바이트 단위로 같다(테스트로 검증).
- 이 성질 하나로 **새로고침 복구**, **작업 이력 복기(임의 시점 상태 재구성)**, **세션 내보내기**가 모두 해결된다. 저장소에는 상태가 아니라 명령 로그만 저장한다.

### 2. 이벤트 기반 상태 전이 (시간만 흐르면 성공하지 않는다)

엔진은 1 tick(= 가상 업무 1분)마다 Agent를 한 단계씩 진행한다.

```
assign ─► (선행 미완료) waiting-deps ─► planning ─► step₁ … stepₙ ─► completed
                                         │        │
                                         │        ├─ gate  → Waiting/Blocked  (플레이어 응답 전까지 정지)
                                         │        └─ fail  → Failed           (원인 해결 후 retry)
                       interrupt ◄───────┴─► resume / restart / handoff / kill
```

- **Step**: 로그 라인을 duration 동안 분산 출력하고, 끝날 때 `effects`(파일 쓰기, flag 설정, Task 활성화 …)를 적용한다.
- **Gate**: 시나리오가 정의한 의사결정 지점. Agent는 플레이어가 답하기 전까지 절대 진행하지 않는다. 선택지마다 효과와 학습 품질(good/bad/neutral)이 있다.
- **Fail**: 조건이 참이면 Task가 실패한다. 원인(flag)을 바꾸지 않고 `retry`하면 같은 실패가 반복된다.
- **Modifier intent**: "원인은 단정하지 말고 …"처럼 지시에 포함된 조건이 flag로 기록되어 이후 step/gate의 분기에 영향을 준다 → *지시의 품질이 결과를 바꾼다*.

Agent 상태: `idle, planning, working, waiting, blocked, reviewing, failed, completed, interrupted`
Task 상태: `locked, ready, assigned, in_progress, waiting, blocked, done, failed`

### 3. 모든 화면은 상태의 투영(projection)

| 화면 | 원천 |
|---|---|
| 터미널 패널 | `SimEvent` 중 패널과 관련된 것(`command`, `cli.output`, `agent.log`, `notify`)을 seq 순서로 렌더 |
| 가상 브라우저 | `PageDef.source` 파일을 VFS에서 읽어 렌더 (dashboard JSON + CSV, markdown, table, mail, text) |
| 파일 탐색기/미리보기 | VFS (파일별 버전 이력, diff) |
| 타임라인 | `agent.status` 이벤트로 Agent별 Gantt 구성 |

따라서 Agent가 `dashboard.json`에 `"bound": false`를 쓰면 브라우저의 필터는 실제로 동작하지 않고(버그 재현), 수정 Task가 `true`로 다시 쓰면 즉시 고쳐진다. 브라우저/파일 조작은 `observe` 명령으로 기록되어 "결과를 검증했는가" 평가에 쓰인다.

### 4. 엔진 ↔ 시나리오 인터페이스

엔진은 특정 제품/도메인을 모른다. 시나리오는 JSON 데이터(roles, files, pages, tasks/steps/gates, intents, evaluation, outcomes, hints)로만 구성되며, 산출물 내용은 `assets/`의 템플릿(`{{#if flag=value}}…{{else}}…{{/if}}`)으로 flag에 따라 달라진다. 자세한 스키마는 [scenario-spec.md](scenario-spec.md).

## 모듈별 책임

| 경로 | 책임 |
|---|---|
| `src/engine/engine.ts` | `Simulation` 클래스, tick 루프, Agent/Task 액션(spawn, assign, interrupt, resume, retry, restart, handoff, kill, resolveGate, submit), Effects, VFS, 템플릿, `replay()` |
| `src/engine/cli.ts` | 명령 파서·실행, 출력 포맷(ANSI), `ls/tree/cat/diff/open/pages`, 자동완성 |
| `src/engine/nlu.ts` | 자연어 처리 파이프라인. 인식 실패 시 성공 처리하지 않고 예시를 안내 |
| `src/engine/evaluate.ts` | 이벤트 로그 + metrics + 시나리오 규칙 → 9개 차원 평가와 개선 제안 |
| `src/scenarios/index.ts` | 시나리오 폴더 자동 로딩 (`import.meta.glob`) |
| `src/scenarios/validate.ts` | 시나리오 정적 검증 (참조 무결성, DAG 순환, 정규식, 템플릿 짝) |
| `src/store/session.ts` | UI 상태, 클럭, ui.request 처리, 자동 저장 |
| `src/store/persist.ts` | IndexedDB 저장/조회/삭제, 세션 내보내기 |
| `src/ui/terminal/termRegistry.ts` | xterm 인스턴스 레지스트리(레이아웃 변경에도 유지), 라인 에디터(한글 폭, 이력, Tab) |

## 성능

- 1 tick 처리 비용은 Agent 수에 비례(수 µs). 1시간 플레이(≈8,000 tick)도 재생에 수십 ms.
- 대용량 CSV는 화면 렌더 시 `useMemo`로 파싱, 표는 500행까지 표시.

## 보안 경계

- 가상 CLI는 문자열 해석기일 뿐이며 OS 명령/네트워크를 실행하는 코드 경로가 없다.
- 가상 브라우저는 `iframe`/`innerHTML`/`eval`을 쓰지 않고, Markdown을 React 요소로 직접 변환한다.
- 빌드 산출물에는 CSP(`script-src 'self'`, `connect-src 'self'`, `frame-src 'none'`)가 삽입된다. 자세한 점검 항목은 [deployment.md](deployment.md).
