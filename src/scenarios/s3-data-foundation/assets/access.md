# 접근 권한 설계

| 역할 | 범위 |
|---|---|
| 수율팀 | mart.* · view.* 읽기 |
| 생산2과 | view.yield_weekly 읽기 (라인 수율) |
| 정보보호팀 | map.pseudonym 읽기 (전용) |
{{#if access.ai.mart_ro}}| **AI 어시스턴트** (서비스 계정) | mart.* · view.* **읽기 전용** — 원천(raw.*)·가명 매핑(map.*) 제외 |
{{/if}}{{#if access.ai.full}}| **AI 어시스턴트** (서비스 계정) | raw.* · mart.* · map.* 읽기/쓰기 |
{{/if}}{{#if access.ai.none}}| AI 어시스턴트 | 권한 없음 |
{{/if}}
## 데이터 오너 승인
| 데이터 | 오너 | 상태 |
|---|---|---|
| 설비 이벤트 | 오태식 파트장 | {{#if approval.oh}}✔ 승인{{else}}대기{{/if}} |
| 불량 | 이도윤 엔지니어 | {{#if approval.lee}}✔ 승인{{else}}대기{{/if}} |
| 개인정보(가명 매핑) | 한유진 책임 | {{#if approval.han}}✔ 승인{{else}}대기{{/if}} |
