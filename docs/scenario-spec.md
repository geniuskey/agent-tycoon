# Scenario Spec — 시나리오 제작 가이드

시나리오는 **코드 수정 없이** 폴더를 추가해서 만든다.

```
src/scenarios/<scenario-id>/
├── scenario.json      # 정의 (아래 스키마)
└── assets/            # 입력 데이터, 산출물 템플릿 (CSV, MD, JSON, 코드 템플릿 …)
```

빌드 시 `import.meta.glob`으로 자동 등록된다. 작성 후 `npm run validate:scenarios`로 검증한다.

> **Scenario = Product Domain × Job Function × Task Type.** 같은 엔진/화면을 쓰고 데이터와 규칙만 바꾼다.

## 1. 최상위 필드

| 필드 | 설명 |
|---|---|
| `id`, `version`, `title` | 고유 ID(폴더명과 동일 권장), 버전, 제목 |
| `domain` | `dram, hbm, nand, foundry, manufacturing, soc, modem, ddi, image-sensor, pmic, security-ic, cpu, gpu, fpga, mcu, common` |
| `function` | 직무 (`device-engineering`, `production-engineering`, `software`, `common` …) |
| `taskType` | 업무 유형 (`data-analysis`, `dashboard`, `report`, `meeting-summary`, `sw-issue` …) |
| `difficulty` (1–3), `estMinutes`, `tags` | 탐색 화면 표시용 |
| `company` | `{ name, org }` — 반드시 가상 회사 |
| `briefing` | `requester`, `title`, `background`, `goal`, `completionCriteria[]`, `deliverables[]`, `constraints[]` |
| `learningObjectives[]` | 학습 목표 |
| `roles[]` | 생성 가능한 Agent 역할 `{ id, name, title, skills[], description }` |
| `files` | 초기 가상 파일 `{ "/path": { src \| content, restricted?, description? } }` |
| `pages[]` | 가상 브라우저 화면 `{ url: "sim://…", title, view, source }` — `view`: `markdown` `dashboard` `table` `mail` `text` `scan`(종이 스캔본 JSON) |
| `tasks[]` | 업무 DAG (아래) |
| `intents[]` | 자연어 지시 규칙 (아래) |
| `evaluation[]` | 학습 피드백 규칙 |
| `outcomes[]` | 결과물 판정 기준 (요청자 반응) |
| `hints[]` | `{ when?, text }` — `hint` 명령 |
| `initialFlags` | 시작 flag (예: 개발 Agent가 만들 버그 `{"bug.filter": true}`) |
| `people[]` | 가상 인물 (대화·신뢰도). 스키마는 [campaign.md](campaign.md#가상-인물-협의-시뮬레이션) |
| `campaign` | `{ id, stage, order, requires[], carry: {flags, files, trust}, defaultCarry }` — 캠페인 단계와 이월 규칙 |

## 2. Task / Step / Gate

```jsonc
{
  "id": "analyze-pattern",
  "title": "불량 패턴·공정 요인 분석",
  "description": "…",
  "type": "statistical-analysis",
  "skills": ["data", "statistics"],          // 이 역량을 모두 가진 role이 '적합'
  "dependsOn": ["validate-data"],            // DAG
  "hidden": false,                           // true면 activateTask 효과로 등장 (수정/재작업 Task)
  "optional": false,                         // true면 제출 필수 조건 아님 (검증 Task 등)
  "review": false,                           // true면 Agent 상태가 Reviewing, '검증' 평가에 반영
  "keywords": ["분석", "패턴"],              // 자연어 키워드 매칭 fallback
  "inputs": [...], "outputs": [...],         // outputs는 '산출물 확인' 평가에 사용
  "steps": [ StepDef, ... ],
  "onComplete": [ Effect, ... ]
}
```

**StepDef**

| 필드 | 설명 |
|---|---|
| `id`, `event` | step ID, 이벤트 라벨 (`"Data validated"`) |
| `ticks` | 소요 시간 `n` 또는 `[min,max]` (seed 난수). 역량 부족 시 ×1.6 |
| `when` | 거짓이면 step 생략 |
| `log[]` | Agent 터미널 로그. 문자열 또는 `{ when, text }` |
| `reads[]` | Agent 컨텍스트에 추가될 파일 |
| `effects[]` | step 종료 시 적용 |
| `gate` | 플레이어 개입 지점 (effects 적용 후 열림) |
| `fail` | `{ when, message, log?, hint? }` — 조건이 참이면 Task 실패 |

**GateDef**

```jsonc
{
  "id": "units",                 // 전역 고유. 선택 결과는 flag "gate.<id>" = option id
  "kind": "waiting",             // waiting(의사결정) | blocked(권한/외부 요인)
  "when": "!units.preinstructed",// 사전 지시가 있으면 gate 생략 가능
  "title": "T-03 측정값 단위 불일치",
  "prompt": ["…"],
  "options": [
    {
      "id": "convert", "label": "ms로 변환",
      "patterns": ["변환", "ms\\s*로"],        // 자연어 응답 정규식 (번호 1..n 도 항상 허용)
      "effects": [{ "type": "setFlag", "flag": "units.ok" }],
      "log": ["…"],
      "quality": "good",                        // good | bad | neutral → 피드백
      "dimension": "domain",                    // 피드백 반영 차원 (기본 recovery)
      "feedback": "bad 선택 시 보여줄 개선 제안"
    }
  ]
}
```

## 3. Effects

모든 Effect는 선택적 `when` 조건을 가진다.

| type | 필드 | 설명 |
|---|---|---|
| `writeFile` | `path`, `src` \| `content`, `variants[{when, src\|content}]` | 파일 생성/수정 (버전 기록). 내용은 템플릿 확장 |
| `deleteFile` | `path` | |
| `setFlag` | `flag`, `value` (기본 true) | 시나리오 상태값 |
| `notify` | `level`, `message` | 셸 패널/알림 |
| `activateTask` | `task` | 숨은 Task 노출, 완료된 Task는 재활성화 |
| `reopenTask` | `task` | Task를 처음 상태로 되돌림 (재작업) |
| `trust` | `person`, `delta` | 인물 신뢰도 변경 |

## 4. 조건식 (Cond)

```jsonc
"units.ok"                              // flag truthy
"!units.ok"                             // flag falsy
{ "flag": "gate.units", "eq": "convert" }
{ "gate": "units", "chose": ["convert", "exclude"] }
{ "taskDone": "analyze-pattern" }
{ "taskStatus": "release", "is": ["failed"] }
{ "fileExists": "/work/report.md" }
{ "trust": "choi", "gte": 50 }          // 인물 신뢰도
{ "all": [...] }  { "any": [...] }  { "not": ... }
```

자동으로 설정되는 flag: `gate.<gateId>`, `quality.<taskId>.low`(역량 부족 진행), `handoff.<fromRole>.<toRole>`.

## 5. 템플릿 (assets)

```
{{agent}} {{role}} {{task}} {{time}} {{flag:name}}
{{#if gate.units=convert}} … {{else}} … {{/if}}      // 중첩 가능, && / || 지원
```

산출물 품질은 **플레이어의 판단(flag)에 따라 템플릿이 달라지는 방식**으로 표현한다. 잘못된 판단은 그럴듯하지만 틀린 산출물을 만든다 — 플레이어가 직접 확인해야 발견할 수 있다.

## 6. Intents (자연어)

처리 순서: ① 열린 gate 응답 → ② 시나리오 intent(정의 순서대로) → ③ 공통(상태/중단/재개/재시도/인계) → ④ Task `keywords` → ⑤ 인식 실패 안내.

```jsonc
{
  "id": "revise-report",
  "patterns": ["(보고서|리포트).*(수정|보완|반영)"],
  "roles": ["reporter"],              // assign 없는 intent에서 다른 role에게 지시하면 '역할 불일치' 안내
  "requires": { "taskDone": "write-report" },
  "deniedReply": ["아직 작성된 보고서가 없습니다."],
  "effects": [{ "type": "activateTask", "task": "revise-report" }],  // assign보다 먼저 적용
  "assign": "revise-report",          // 대상 Agent(없으면 적합한 대기 Agent)에게 배정
  "redo": false,                      // 완료된 Task 재수행 허용 (예: 재테스트)
  "modifier": false,                  // true: 효과만 적용하고 다음 intent 매칭 계속
  "quality": "good",
  "reply": ["…"],
  "example": "@reporter 검증 결과 반영해서 보고서 보완해"   // 인식 실패 시 안내 예시
}
```

**작성 팁**
- 구체적인 패턴을 앞에, 일반적인 패턴(예: "분석")을 뒤에 둔다.
- "~하지 말고", "~도 확인해" 같은 조건 지시는 `modifier: true`로 만든다. 사전 지시로 gate를 피할 수 있게 하면 "예방" 학습이 된다.
- 지원하지 않는 요청은 매칭되지 않게 둔다. 엔진은 절대 임의로 성공 처리하지 않는다.

## 6-1. 객관식 선택지

- **지시**: `intents[].label`이 선택지 문구. `modifier: true`인 intent는 '조건(복수)'으로 표시. `requires`가 거짓이면 숨김, `hiddenChoice: true`면 자유 입력 전용.
- **발견 후에만 보이는 선택지**: `requires: { "observed": "sim://fab/monitor" }` — 플레이어가 그 화면/파일을 연 뒤에만 노출.
- **질문**: `people[].topics[].ask`(없으면 `hint`)가 선택지 문구. 함정 질문(신뢰 하락)도 `ask`를 붙여 섞는다. `patience`(기본 5)를 넘으면 30분 회의에 들어가고 남은 메시지는 회의 후에 답한다. `replyDelay`(기본 2 tick)는 메시지를 읽기까지 걸리는 시간, `schedule: [{from:"10:30", to:"11:10", label}]`은 메시지를 보지 않는 고정 일정.
- **복수 선택 gate**: `{ "multi": true, "min": 1, "max": 4 }`. 선택한 모든 옵션의 효과 적용, flag `gate.<id>.<option>`=true/false. `quality: good`인데 고르지 않은 옵션은 '빠뜨림'으로 피드백.
- **함정 설계 원칙**: 정답만 있는 선택지는 학습이 없다. 실무에서 흔한 지름길(검증 생략, 추정으로 채우기, 외부 서비스, 현장 압박)을 그럴듯한 문구로 넣는다.

## 7. Evaluation / Outcomes

- `outcomes[]`: 요청자 관점의 결과물 판정 `{ id, label, success: Cond, successText, failText }`. 모두 충족 → "그대로 채택".
- `evaluation[]`: `{ dimension, when, kind: positive|issue, text, suggestion }`. 9개 차원:
  `decomposition, assignment, parallelism, verification, recovery, duplication, domain, evidence, security, collaboration`
  (`collaboration`은 `people`이 있는 미션에서만 표시)
- 1–6번 차원과 보안 일부는 엔진이 이벤트 로그로 **자동 계산**한다(배정 역량 일치, 동시 작업, 산출물 열람, gate 품질, 중복/재시도, 미사용 Agent, 제한 파일 접근 …). 시나리오 규칙은 도메인 특화 판단을 더한다.

## 8. 시나리오 설계 체크리스트

1. 실패는 **원인과 조건이 정의**되어 있는가? (무작위 실패 금지)
2. 모든 실패는 플레이어 개입으로 **예방(modifier) 또는 복구(gate/수정 Task/retry)** 가능한가?
3. 잘못된 판단이 **관찰 가능한 산출물**(파일·브라우저)에 드러나는가?
4. 병렬 가능한 Task가 최소 한 쌍 있는가?
5. 교차 검증/리뷰 Task가 있는가 (optional 권장)?
6. 보안 판단 지점(권한 없는 데이터, 외부 공유, 공용 계정 등)이 있는가?
7. 데이터는 합성인가? 실제 회사·고객·Lot·Wafer ID가 없는가? (`SIM-` 접두어 권장)
8. `npm run validate:scenarios` 통과, `tests/`에 정상 경로 + 실패/복구 경로 플레이스루 테스트 추가

## 9. 데이터 생성

`scripts/gen-data.mjs`는 seed 고정 합성 데이터 생성기다. 데이터 변형(예: 단위 변환/제외/원본)을 미리 생성해 두고 `writeFile.variants`로 선택한다.

```bash
npm run gen:data
```
