# 회의록 검토 의견

- 검토: {{agent}} · {{time}}
- 대상: `/work/minutes/summary.md`, `/work/minutes/action_items.md` ↔ `/docs/transcript.txt`

| 항목 | 결과 | 근거 |
|---|---|---|
| 베타 일정 | ❌ 오류 → 수정 필요 | 요약본 '11월 28일' ↔ 녹취 10:04 '12월 5일 확정' (11월 말은 원래 계획) |
| Action Item 담당자 | {{#if gate.owner=minsu}}✅ 일치{{else}}⚠ 확인 필요{{/if}} | 녹취 10:09–10:10 박민수 수락 |
| 대외비 내용 | {{#if summary.confidential}}❌ 배포본에 대외비 포함{{else}}✅ 제외됨{{/if}} | 녹취 10:21 [대외비] |
| 기한 | ✅ 일치 | 11/26, 12/3 |

## 요청
- 요약본의 베타 일정을 12월 5일로 수정
{{#if summary.confidential}}- 배포본에서 [대외비] 섹션 삭제{{/if}}
