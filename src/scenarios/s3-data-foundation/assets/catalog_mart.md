# 데이터: 수율 마트

> 소유: 데이터플랫폼팀 (운영) · 수율팀 (내용) | 갱신: 매일 04:30 | 상태: sim://db

사람과 AI가 수율 데이터를 찾을 때 여기서 시작한다. **보고서와 AI 분석은 이 마트만 쓴다.**

| 테이블 | 내용 | 키 | 오너 |
|---|---|---|---|
| mart.equipment_event | 설비 정지·PM 이벤트 (`*_utc` 시각) | eq_id | 설비기술팀 |
| mart.checksheet | 현장 점검 — LOW_CONFIDENCE·NOT_MEASURED는 '모름' 표시 | eq_id, date, shift | 생산2과 |
| mart.defect_daily | 일별 불량 — 11/10 이전 D07은 D07_LEGACY | date, code | 검사기술팀 |
| view.yield_weekly | 라인 수율 · 검사 수율 (위키 표준: 지표 정의) | week | 수율팀 |
| dim.equipment_alias | 기준 키 ↔ 부서별 이름 | eq_id | IT/MES |

- 표준: sim://wiki/equipment-id · sim://wiki/time · sim://wiki/defect-code · sim://wiki/yield
- 접근: 수율팀·생산(뷰)·AI 어시스턴트{{#if access.ai.mart_ro}}(읽기 전용){{/if}} — 신청은 데이터 오너 승인
{{#if catalog.sample}}
## 샘플 데이터
| eq_id | date | worker | particle |
|---|---|---|---|
| EQ-N2-ET07 | 2026-11-17 | W-01 | 40 |
| EQ-N2-ET07 | 2026-11-17 | W-02 | 41 |

가명 매핑 키 위치: `map.pseudonym`
{{/if}}
