# 배포 가이드 (사내망 / 오프라인)

## 빌드
```bash
npm ci          # 사내 npm 미러 사용 가능
npm test
npm run build   # → dist/ (정적 파일만)
```
`dist/`를 임의의 정적 웹서버(nginx, Apache, IIS, 사내 오브젝트 스토리지)의 하위 경로에 그대로 올리면 됩니다. `base: './'`로 빌드되어 경로 설정이 필요 없습니다.

```nginx
location /agent-tycoon/ {
  alias /srv/agent-tycoon/dist/;
  add_header X-Content-Type-Options nosniff;
  add_header Referrer-Policy no-referrer;
}
```

## 런타임 의존성
| 항목 | 사용 여부 |
|---|---|
| 외부 AI/LLM API | ❌ 없음 |
| CDN (스크립트/폰트/스타일) | ❌ 없음 — 모든 리소스 번들, 시스템 폰트 사용 |
| 백엔드/DB | ❌ 없음 — 브라우저 IndexedDB(로컬) |
| 외부 인증 | ❌ 없음 |
| 네트워크 요청 | 정적 파일 로드 외 없음 (`connect-src 'self'`) |

## 보안 점검 항목
- [x] CSP 메타 태그 (빌드 시 삽입): `default-src 'self'; script-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; form-action 'none'`
- [x] 가상 CLI는 문자열 해석기 — `eval`, `Function`, OS 명령, `fetch` 경로 없음
- [x] 가상 브라우저: `iframe`/`dangerouslySetInnerHTML` 미사용, Markdown은 React 요소로 변환
- [x] 시나리오 데이터는 합성(SIM- 접두어 ID, 가상 회사 Nova Semiconductor)
- [x] 학습 이력은 사용자 브라우저 로컬에만 저장 (서버 전송 없음)
- [ ] 배포 전: `npm audit --omit=dev`, 사내 SCA 도구로 `package-lock.json` 점검
- [ ] 배포 전: 신규 시나리오의 데이터가 실제 제품/고객/Lot/Wafer 정보를 포함하지 않는지 검토 (시나리오 리뷰 체크리스트: docs/scenario-spec.md §8)
- [ ] 웹서버 보안 헤더 (X-Content-Type-Options, Referrer-Policy) 적용

## 운영 의존 패키지 (번들에 포함)
react, react-dom, zustand, @xterm/xterm(+fit, search, unicode11), echarts, react-resizable-panels — 모두 MIT/Apache-2.0.
