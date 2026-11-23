# 샘플 플레이 Walkthrough — DRAM Retention 불량 원인 분석

> 실제 플레이 로그를 정리한 예시입니다. 시각은 가상 업무 시간입니다.

### 1. 업무 파악 (09:00)
```text
❯ open sim://mail/request        # 요청: 패턴, 공정 요인, 근거, 영향 범위. 고객 정보 제외. 확실하지 않으면 '추가 확인 필요'
❯ task graph
  단계 1  [validate-data]  ‖  [map-process-history]     ← 병렬 가능
  단계 2  [analyze-pattern]
  단계 3  [cross-validate]  ‖  [write-report]
```

### 2. 병렬 위임 + 사전 지시 (09:03)
```text
❯ agent spawn analyst
❯ agent spawn domain-expert
analyst ❯ 데이터 검증할 때 tester별 단위도 확인해줘        # modifier: 단위 확인 사전 지시
domain-expert ❯ lot 공정 이력과 설비 경로를 정리해줘
```
analyst 로그: `⚠ T-03 값이 약 1/1000 — 사전 지시대로 단위 확인: FW 2.1.0 출력 단위 s → ms 변환` — gate 없이 예방됨.
(사전 지시가 없으면 `⏸ 의사결정 필요: T-03 측정값 단위 불일치`가 열립니다. "그대로 진행"을 고르면 SIM-L04가 100% 불량으로 보이는 착시가 생기고, 이후 교차 검증 단계에서 실패로 드러납니다.)

### 3. 분석과 결론 방식 (09:25)
```text
analyst ❯ 원인은 단정하지 말고 불량 패턴 분석해줘
❯ open sim://dram/dashboard      # Wafer map: CH-B wafer들의 edge ring, CAP_DEP vs SN_ETCH 비교
```

### 4. 교차 검증 ‖ 보고서 (09:50)
```text
❯ agent spawn reporter
domain-expert ❯ 분석 결과의 원인 가설을 교차 검증해줘
reporter ❯ 고객 정보는 제외하고 품질회의 보고서 초안 작성해
```
보고서가 먼저 끝나면 `＋ 새 Task 추가: revise-report` — 검증 결과가 보고서에 반영되지 않았다는 알림.
```text
reporter ❯ 검증 결과 반영해서 보고서 근거 보완해
❯ diff /work/report/retention_rca_report.md
❯ open sim://dram/report
```

### 5. 제출 (10:40)
```text
❯ submit
```
요청자 반응: "요청자가 결과물을 그대로 채택했습니다." — 원인 결론 / 근거 충분성 / 데이터 정합성 / 보안 준수 모두 충족.
피드백 예: *병렬 처리 ✔ 최대 3개 Agent 동시 운용*, *근거 확인 ✔ DEP-02 교란 요인 기각*, *도메인 ✔ 단위 사전 확인*.

## 다른 경로를 시도해 보세요
- 단위 gate에서 "그대로 진행" → 교차 검증 실패 → 재검증·재분석 → `agent retry domain-expert`
- 원인 gate에서 "ETCH-07 CH-B로 확정" → 결론은 맞지만 '근거 충분성' 실패
- 보고서 gate에서 "다른 경로로 가져와서 넣어" → 보안 위반
