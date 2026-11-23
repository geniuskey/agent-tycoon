# 주간 수율 보고 — W51 {{#if w51.published}}(게시본){{else}}(초안){{/if}}

> 작성: 주간 보고 Agent · 지식: AGENTS.md{{#if w51.used.skill}} + skills/weekly-report{{/if}}

| 지표 | W50 | W51 | 출처 |
|---|---|---|---|
| 라인 수율 | 91.1% | 91.3% | {{#if w51.used.cite || kb.cite_rule}}view.yield_weekly.line_yield{{else}}—{{/if}} |
| 검사 수율 | 94.6% | {{#if w51.left.yield}}94.1%{{else}}94.7%{{/if}} | {{#if w51.used.cite || kb.cite_rule}}view.yield_weekly.inspection_yield{{else}}—{{/if}} |
| D07 (스크래치) | 41 | 58 | {{#if w51.used.cite || kb.cite_rule}}view.yield_weekly.d07_count{{else}}—{{/if}} |

## 주요 변동
- D07 41 → 58 (+41%). {{#if w51.left.cause}}**원인: CMP 슬러리 교체 지연.** CMP 공정 점검이 필요합니다.{{/if}}{{#if w51.fix.cause && cause.checked}}가설: 스크러버 점검 중 영향 가능 (이도윤 엔지니어 12/29 확인: 이번 주 슬러리 교체 없음) — 원인 확정 아님{{/if}}{{#if w51.fix.cause && !cause.checked}}가설: CMP 슬러리 상태 또는 스크러버 — 검사기술팀 확인 필요{{/if}}{{#if !w51.issue.cause}}가설: CMP 슬러리 상태 또는 스크러버 — 검사기술팀 확인 필요{{/if}}

## 설비 이벤트
- ETCH-07 (EQ-N2-ET07) 정지 {{#if w51.left.utc}}04:20–07:50 (로거){{else}}13:20–16:50 (KST){{/if}} — MFC 알람
- {{#if w51.left.et12}}ETCH-01 (EQ-N2-ET01) 파티클 상승 — 장비 노후 추정{{/if}}{{#if w51.ok.et12 || w51.fix.et12}}ETCH-12 (EQ-N2-ET12, 12/17 신규 가동) 셋업 중 파티클 상승{{/if}}{{#if w51.flag.et12 && !w51.fix.et12}}EQ-N2-ET12 파티클 상승 — **확인 필요** (설비 마스터에 별칭 없음){{/if}}
{{#if w51.left.hr}}
## 참고
- 야간조 W-02 점검 누락 이력 있음 (평가 반영 검토 — 회의록)
{{/if}}
---
{{#if w51.published}}게시: 수율팀 채널{{else}}초안 — 게시 전 검토 필요{{/if}}{{#if w51.posted_unreviewed}} · ⚠ 검토 전에 팀 채널에 올라감{{/if}}
