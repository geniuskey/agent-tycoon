# 데이터 인벤토리 — 주간 수율 보고 (As-Is)

- 작성: {{agent}} · {{time}} · 근거: 담당자 인터뷰
- 대상 보고서: 주간 수율 보고 (라인 수율 · 불량 Top5 · 다운타임 영향)

## 1. 데이터 출처
| # | 출처 | 형태 | 정형화 | 담당 | 접근 | 비고 |
|---|---|---|---|---|---|---|
{{#if found.mes}}| 1 | MES 수율 export | CSV | 높음 | 박서준 | {{#if found.access}}승인 절차 필요 (데이터 오너+보안 검토){{else}}❓ 미확인{{/if}} | 라인 수율 |
{{/if}}{{#if found.defect_excel}}| 2 | 검사실 불량분류표 | 엑셀 (주차별 시트 복사, 병합셀) | 낮음 | 이도윤 | 공유폴더 | 불량 Top5{{#if found.code_change}} · ⚠ W46 코드 개정(D07→D07a/b){{/if}} |
{{/if}}{{#if found.downtime_mail}}| 3 | 설비팀 다운타임 메모 | 메일 본문 (자유 서술) | 매우 낮음 | 설비팀 | 메일 | 다운타임 영향 |
{{/if}}{{#if found.checksheet}}| 4 | 현장 설비 점검 체크시트 | **종이** (사진/스캔) | 없음 | 최재석 | 현장 보관 | 불량 원인 코멘트{{#if found.pii}} · ⚠ 작업자 이름·사번{{/if}} |
{{/if}}{{#if found.macro}}| 5 | 박서준 개인 엑셀 매크로 | xlsm (개인 PC) | — | 박서준 | 개인 | ⚠ **문서화 안 된 계산 규칙** (재측정·엔지니어링 lot 제외 등) |
{{/if}}
{{#if !found.mes}}- ❓ 라인 수율 지표의 출처 미확인
{{/if}}{{#if !found.defect_excel}}- ❓ 불량 Top5 지표의 출처 미확인
{{/if}}{{#if !found.downtime_mail}}- ❓ 다운타임 영향 지표의 출처 미확인
{{/if}}
## 2. 업무 부하
{{#if pain.time}}- 보고서 작성에 매주 **약 6시간** (박서준). 양식 불일치로 복붙 오류 발생{{else}}- 작업 시간: 미확인{{/if}}

## 3. 품질 리스크
{{#if found.code_change}}- 불량 코드 체계 개정 (W46~): 과거 데이터와 연속성 문제
{{/if}}{{#if found.backfill}}- 체크시트 **사후 일괄 기록** (야간조) → 기록 시각 신뢰도 낮음
{{/if}}{{#if found.macro}}- 핵심 계산 규칙이 개인 매크로에만 존재 → 담당자 부재 시 재현 불가
{{/if}}{{#if found.legend}}- 체크시트 기호 체계: CK=점검완료, X=NG, '-'=미측정 (현장 구두 규칙)
{{/if}}{{#if !found.code_change && !found.backfill && !found.macro}}- (확인된 리스크 없음 — 추가 인터뷰 필요할 수 있음)
{{/if}}
## 4. 보안·규정
{{#if found.pii}}- 체크시트에 작업자 이름·사번 (개인정보){{#if found.pii_rule}} → 분석용 마스킹 필요 (정보보호팀){{/if}}
{{/if}}{{#if found.access}}- MES 데이터 반출: 데이터 오너 승인 + 보안 검토, 공용 저장소만 사용
{{/if}}{{#if found.ai_policy}}- 사내 AI 어시스턴트 사용 가능, 외부 AI 서비스 업로드 금지
{{/if}}{{#if !found.pii && !found.access}}- ❓ 보안 검토 미실시
{{/if}}
