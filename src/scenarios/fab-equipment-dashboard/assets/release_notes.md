# fab-monitor v1.0 배포 노트

- 배포: {{agent}} · {{time}}
- 주소: `sim://fab/monitor`
- QA: `/work/qa/test_report.md` {{#if qa.passed}}(전 항목 PASS){{/if}}

## 기능
- 설비별 chamber pressure 시계열 (KST)
- 설비 필터
- 알람 목록 — {{#if rule=spc}}설비별 SPC 관리한계{{else}}고정 임계값 50 mTorr{{/if}}
- 정비 이력

## 알려진 제약
- 데이터는 export 파일 기반 (운영 DB 연동은 정보보호팀 승인 후)
