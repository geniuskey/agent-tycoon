# 원인 가설 교차 검증 (Domain Review)

- 검토자: {{agent}} · {{time}}
- 검토 대상: `/work/analysis_summary.md`, `/work/wafer_route.csv`, `/data/equipment_pm_log.csv`

## 1. 데이터 정합성
- T-03(SIM-L04) 단위: {{#if gate.units=convert}}ms 변환 확인 ✅{{else}}{{#if gate.units=exclude}}분석에서 제외됨 — L04 영향 판단 불가 ⚠{{else}}미처리 ❌{{/if}}{{/if}}

## 2. 가설 B: DEP-02 (lot 단위) — ❌ 기각
- DEP-02를 거친 lot 중 **ETCH-07 CH-A** 로 SN_ETCH 한 wafer 5장의 불량률: **1.4%** (정상 수준)
- 즉 DEP-02 상관은 같은 lot 안에 CH-B wafer가 섞여 생긴 **교란(confounding)**

## 3. 가설 A: ETCH-07 CH-B — ✅ 지지
- CH-B 7 wafer 모두 edge ring 불량 (44~57%), CH-A wafer는 정상
- **2026-10-14 CH-B PM**: focus ring 교체(vendor B), **edge He flow 12 → 9 sccm**
- PM 이후 Qual에서 **edge CD 미측정** → edge 영역 SN etch profile 변화가 검출되지 않았을 가능성
- 메커니즘: edge 영역 etch profile 변화 → storage node 접합 누설 증가 → retention 저하 (edge ring 패턴과 일치)
- 시점: CH-B를 거친 lot은 모두 10/15 이후 (PM 이후)

## 4. 결론 및 추가 확인 필요
- 유력 원인: **ETCH-07 CH-B PM 이후 edge 조건 변화** (근거: 공간 패턴, chamber 분리, 시점, PM 이력)
- 추가 확인 필요:
  1. CH-B edge CD / profile 계측 (단면 SEM)
  2. edge He flow 원복 후 split 테스트
  3. CH-B 사용 중지 또는 hold 여부 — 설비팀 협의
