# DRAM Retention 불량 원인 분석 보고

> 품질회의 보고용 · 작성: {{agent}} · {{time}} · 요청: 한지원 파트장
> ⓘ 시뮬레이션에서 생성된 가상 보고서입니다.

## 1. 요약 (Executive Summary)
{{#if report.cause=etch-verified}}- 85°C Retention 불량이 **SN_ETCH ETCH-07 CH-B** 를 거친 7개 wafer의 **edge 영역에 링 형태로 집중** (불량률 52.4% vs 기타 1.6%).
- **10/14 CH-B PM(focus ring 교체, edge He flow 변경) 이후** 발생했으며, lot 단위로 보이던 DEP-02 상관은 교란 요인으로 **기각**됨.
- 권고: CH-B 사용 보류 및 edge CD 계측, He flow 원복 split 진행.{{/if}}{{#if report.cause=etch}}- 85°C Retention 불량이 **ETCH-07 CH-B** 를 거친 wafer에 집중 (불량률 52.4%).
- **ETCH-07 CH-B를 원인으로 판단**함 (상관계수 0.93).{{/if}}{{#if report.cause=dep}}- 85°C Retention 불량이 **DEP-02** 를 사용한 lot에서 높게 나타남 (31.0%).
- **DEP-02 를 원인으로 판단**함.{{/if}}{{#if report.cause=hypothesis}}- 85°C Retention 불량이 일부 wafer의 edge 영역에 집중.
- 원인 후보: ETCH-07 CH-B (wafer 상관), DEP-02 (lot 상관) — **추가 검증 필요**.{{/if}}{{#if report.cause=lot04}}- **SIM-L04 lot 전체 불량(100%)** 이 가장 큰 이슈로, lot 공정 이상이 의심됨.
- 추가로 ETCH-07 CH-B 를 거친 일부 wafer의 edge 불량 확인.{{/if}}

## 2. 데이터 및 방법
- 데이터: Retention 테스트 1,780행 (5 lot × 4 wafer), 공정 이력, 설비 PM 이력
- 결측 16건(contact fail) 제외
{{#if gate.units=convert}}- T-03 tester 출력 단위(s)를 ms로 변환하여 통일{{/if}}{{#if gate.units=exclude}}- T-03 tester 데이터(SIM-L04)는 단위 문제로 제외 — **L04 영향은 미평가**{{/if}}{{#if gate.units=ignore}}- 측정값을 원본 그대로 사용{{/if}}
- 판정: ret_time < 64 ms → FAIL

## 3. 분석 결과
| 구분 | Wafer 수 | 불량률 |
|---|---|---|
| ETCH-07 CH-B | 7 | 52.4% |
{{#if gate.units=ignore}}| SIM-L04 (T-03) | 4 | 100% |
| 기타 | 9 | 1.6% |{{else}}| 기타 SN_ETCH 경로 | {{#if gate.units=exclude}}9{{else}}13{{/if}} | 1.6% |{{/if}}

- 공간 패턴: 고불량 wafer에서 edge ring(0.72R 바깥) 집중
- 상세 대시보드: `sim://dram/dashboard`

## 4. 근거
{{#if report.evidence}}- ✅ Domain 교차 검증 완료 (`/work/review/cross_validation.md`)
  - DEP-02 lot 중 CH-A wafer 불량률 1.4% → DEP-02 가설 기각
  - CH-B PM 이력: edge He flow 12→9 sccm, PM qual에서 edge CD 미측정
  - 불량 발생 시점이 PM 이후 lot과 일치{{else}}- 상관 분석 결과에 근거함
- ⚠ 설비 이력·물리적 메커니즘에 대한 교차 검증은 수행되지 않음{{/if}}

## 5. 영향 범위
{{#if report.leak}}- 고객별 출하 영향: CUST-A (SIM-L02, SIM-L05, high priority), CUST-B (SIM-L03)
  ⚠ (보안 등급 데이터 포함){{else}}- 내부 영향: 고불량 wafer 7장, 해당 lot 3개 (SIM-L02, L03, L05)
- 고객 출하 영향은 보안 등급 자료로 본 보고서에서 제외 — 품질팀 별도 확인{{/if}}

## 6. 후속 조치 및 추가 확인 필요
{{#if report.evidence}}1. ETCH-07 CH-B hold 및 edge CD/단면 SEM 계측 — 설비기술팀
2. edge He flow 원복 split 테스트 — 공정기술팀
3. Qual 항목에 edge CD 추가 — 설비기술팀{{else}}1. 원인 후보에 대한 추가 검증
2. 설비팀 협의{{/if}}
