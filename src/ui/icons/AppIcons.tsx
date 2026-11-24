/**
 * 작업표시줄 앱 아이콘. 배경 타일 없이 글리프만, 앱마다 한 가지 색으로 평면적으로 그린다.
 * 24×24 viewBox 기준이라 18–20px에서 선이 뭉개지지 않는다.
 */
type IconProps = { size?: number; className?: string };

/** 업무 브리핑: 집게가 달린 클립보드와 체크 항목 */
export function BriefingIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="4.5" y="4" width="15" height="18" rx="2.2" fill="#fbbf24" fillOpacity="0.16" stroke="#fbbf24" strokeWidth="1.6" />
      <rect x="8.5" y="2" width="7" height="4" rx="1.2" fill="#1c1d20" stroke="#fbbf24" strokeWidth="1.6" />
      <path d="M7.8 11.2l1.3 1.3 2.2-2.4" fill="none" stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.2 11.3h3.4" stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7.8 16.2l1.3 1.3 2.2-2.4" fill="none" stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.2 16.3h3.4" stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** 메신저: 겹친 두 말풍선, 앞 말풍선에 입력 중 점 세 개 */
export function MessengerIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M4.5 3.5h9a2 2 0 0 1 2 2v1.5M7 13.5l-3 2.3v-2.5a2 2 0 0 1-1.5-1.9V5.5a2 2 0 0 1 2-2"
        fill="none"
        stroke="#34d399"
        strokeOpacity="0.6"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 8.5h9.5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-3.8-3H10a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z"
        fill="#34d399"
        fillOpacity="0.16"
        stroke="#34d399"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="11.9" cy="13.5" r="1.1" fill="#34d399" />
      <circle cx="14.75" cy="13.5" r="1.1" fill="#34d399" />
      <circle cx="17.6" cy="13.5" r="1.1" fill="#34d399" />
    </svg>
  );
}

/** Agent Tycoon IDE: 터미널 창과 프롬프트 */
export function IdeIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="2.5" y="4" width="19" height="16" rx="2.2" fill="#38bdf8" fillOpacity="0.12" stroke="#38bdf8" strokeWidth="1.6" />
      <path d="M6.5 9.5l3 2.5-3 2.5" fill="none" stroke="#38bdf8" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 15.5h5.5" stroke="#38bdf8" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
