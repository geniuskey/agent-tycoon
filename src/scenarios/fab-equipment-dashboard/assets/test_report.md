# QA 테스트 보고서 — fab-monitor

- 테스터: {{agent}} · {{time}}
- 대상: `sim://fab/monitor`, `/app/fab-monitor/*`, `/work/sensor_clean.csv`

| # | 테스트 | 결과 | 비고 |
|---|---|---|---|
| T1 | 설비 필터 선택 시 차트/알람이 해당 설비로 제한 | {{#if bug.filter}}❌ FAIL{{else}}✅ PASS{{/if}} | {{#if bug.filter}}선택값이 쿼리에 전달되지 않음 (FilterBar onChange 미연결){{else}}정상{{/if}} |
| T2 | 시각 KST 일치 (정비 이력과 교차 확인) | {{#if tz.ok}}✅ PASS{{else}}❌ FAIL{{/if}} | {{#if tz.ok}}ETCH-07 압력 상승 13:00–14:30, 정비 기록(13:20 신고, 14:40 MFC 교체)과 일치{{else}}ETCH-07 압력 상승이 04:00–05:30에 표시됨 — 정비 기록(13:20)과 9시간 차이 → UTC 미변환{{/if}} |
| T3 | 알람 기준 = 회의 결론 (설비별 SPC) | {{#if rule=spc}}✅ PASS{{else}}❌ FAIL{{/if}} | {{#if rule=spc}}ETCH-07 이탈 11건 검출, DEP-02 오알람 없음{{else}}DEP-02 정상 운전 144건 전부 알람(오알람), ETCH-07 실제 이상 미검출{{/if}} |
| T4 | 빌드/렌더링 | ✅ PASS | - |

## 결론
{{#if qa.passed}}- ✅ 모든 테스트 통과 — 배포 가능{{else}}- ❌ 실패 항목 수정 후 재테스트 필요{{/if}}
