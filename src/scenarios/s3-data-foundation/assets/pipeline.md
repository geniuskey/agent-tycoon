# 적재 파이프라인

- 소스: {{#if pipe.export}}IT 일 배치 export (`/export/mes/*.csv`, 매일 02–04시){{/if}}{{#if pipe.direct}}운영 MES DB 직접 조회 (`mes-prod-db`, 공용 계정){{/if}}
- 일정: 매일 04:30 적재 → 품질 검사 → 보고 뷰 갱신
- 실패 행: {{#if pipe.quarantine}}`quarantine.*`에 사유와 함께 격리, 데이터 오너에게 알림{{/if}}{{#if pipe.skip}}건너뛰고 계속 (로그에만 기록){{/if}}
