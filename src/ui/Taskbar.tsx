import type { ReactNode } from 'react';
import { formatSimTime } from '../engine/engine';
import { useSession } from '../store/session';
import { useSim } from './common';
import { totalUnread } from './messenger/Messenger';
import { BriefingIcon, IdeIcon, MessengerIcon } from './icons/AppIcons';

/**
 * 가상 사내 PC의 작업표시줄. 무대가 'Nova 사내 PC'라는 것을 화면 구조로 보여 준다.
 * 시작 버튼(홈) · 실행 중인 앱(IDE, 메신저) · 트레이(알림 · 배속 · 가상 업무 시계).
 * 앱 버튼은 실제로 따로 뜨는 창에만 둔다 — IDE 안에 붙은 패널(브라우저 등)은 앱인 척하지 않는다.
 */
export const TASKBAR_H = 36;

export default function Taskbar() {
  const screen = useSession((s) => s.screen);
  const sim = useSim();
  const inWork = screen === 'workspace' && !!sim;
  const { goHome } = useSession.getState();

  return (
    <footer
      className="relative z-[60] flex shrink-0 items-stretch gap-1 border-t border-black/70 bg-gradient-to-b from-[#1c1d20] to-[#131416] px-1.5 text-[12px] text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] select-none"
      style={{ height: TASKBAR_H }}
    >
      <TaskBtn title="시작 — 미션 목록" onClick={goHome} active={screen === 'home'}>
        <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-accent font-mono text-[12px] font-bold text-white">N</span>
      </TaskBtn>
      <span className="mx-1 my-2 w-px bg-line" />
      <IdeApp />
      {inWork && <BriefingApp />}
      {inWork && <MessengerApp />}

      <div className="ml-auto flex items-stretch gap-1">
        <span
          className="my-auto mr-1 rounded-[4px] border border-amber-600/50 bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold tracking-wider text-amber-300"
          title="실제 AI API를 호출하지 않는 시뮬레이션입니다. 모든 데이터는 합성 데이터입니다."
        >
          SIMULATION
        </span>
        {inWork && <Tray />}
      </div>
    </footer>
  );
}

function TaskBtn({ children, title, onClick, active }: { children: ReactNode; title: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`my-0.5 flex items-center gap-1.5 rounded-[4px] px-2 transition-colors ${active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.06]'}`}
    >
      {children}
    </button>
  );
}

/** 실행 중인 앱: 아래 짧은 막대 = 열림, 긴 강조 막대 = 앞에 떠 있음 */
function AppBtn({ label, icon, open, active, badge, onClick, title }: { label: string; icon: ReactNode; open: boolean; active?: boolean; badge?: number; onClick?: () => void; title?: string }) {
  return (
    <button
      title={title ?? label}
      onClick={onClick}
      className={`relative my-[3px] flex min-w-[128px] items-center gap-2 rounded-[5px] px-2 transition-colors ${active ? 'bg-white/[0.08] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]' : 'hover:bg-white/[0.05]'}`}
    >
      <span className={`flex shrink-0 transition-transform ${active ? '' : 'opacity-90 saturate-[0.85]'}`}>{icon}</span>
      <span className={active ? 'font-medium text-strong' : 'text-dim'}>{label}</span>
      {!!badge && <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] leading-4 font-bold text-white">{badge}</span>}
      {open && <span className={`absolute bottom-0 left-1/2 h-[3px] -translate-x-1/2 rounded-full transition-all ${active ? 'w-6 bg-accent' : 'w-2 bg-faint'}`} />}
    </button>
  );
}

function IdeApp() {
  const front = useSession((s) => s.frontWindow === null);
  const { raiseWindow } = useSession.getState();
  return <AppBtn label="Agent Tycoon" icon={<IdeIcon />} open active={front} onClick={() => raiseWindow(null)} />;
}

function BriefingApp() {
  const open = useSession((s) => s.showBriefing);
  const front = useSession((s) => s.frontWindow === 'briefing');
  const { setShowBriefing, raiseWindow } = useSession.getState();
  return (
    <AppBtn
      label="업무 브리핑"
      icon={<BriefingIcon />}
      open={open}
      active={open && front}
      onClick={() => (!open ? setShowBriefing(true) : front ? setShowBriefing(false) : raiseWindow('briefing'))}
      title={open ? (front ? '업무 브리핑 최소화' : '업무 브리핑 앞으로') : '업무 브리핑 열기'}
    />
  );
}

function MessengerApp() {
  const sim = useSim()!;
  const open = useSession((s) => s.messengerOpen);
  const front = useSession((s) => s.frontWindow === 'messenger');
  const readSeq = useSession((s) => s.readSeq);
  const { setMessengerOpen, raiseWindow } = useSession.getState();
  if (!sim.scenario.people?.length) return null;
  return (
    <AppBtn
      label="메신저"
      icon={<MessengerIcon />}
      open
      active={open && front}
      badge={totalUnread(sim, readSeq)}
      onClick={() => (!open ? setMessengerOpen(true) : front ? setMessengerOpen(false) : raiseWindow('messenger'))}
      title={open ? (front ? '메신저 최소화' : '메신저 앞으로') : '메신저 열기'}
    />
  );
}

function Tray() {
  const sim = useSim()!;
  const speed = useSession((s) => s.speed);
  const bottomTab = useSession((s) => s.bottomTab);
  const bottomOpen = useSession((s) => s.bottomOpen);
  const { setSpeed, setBottom } = useSession.getState();
  const notes = sim.events.filter((e) => e.type === 'notify').length;
  const notifyShown = bottomOpen && bottomTab === 'notify';
  return (
    <>
      {sim.has('timeline') && (
        <>
          <TaskBtn title="알림 — 아래 패널의 알림 탭" onClick={() => setBottom(notifyShown ? 'timeline' : 'notify')} active={notifyShown}>
            <span className="relative text-[14px] leading-none text-dim">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {notes > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[15px] rounded-full bg-sky-500 px-1 text-center text-[9.5px] leading-[15px] font-bold text-white">
                  {notes > 99 ? '99+' : notes}
                </span>
              )}
            </span>
          </TaskBtn>
          <span className="mx-0.5 my-2 w-px bg-line" />
        </>
      )}
      <div className="my-auto flex items-center rounded-[5px] border border-line bg-black/20 p-0.5" role="group" aria-label="시뮬레이션 속도">
        {[0, 1, 2, 4].map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`rounded-[3px] px-1.5 py-0.5 text-[11px] transition-colors ${
              speed === s ? (s === 0 ? 'bg-amber-500/25 text-amber-200' : 'bg-accent/30 text-strong') : 'text-dim hover:bg-white/[0.06] hover:text-fg'
            }`}
            title={s === 0 ? '일시정지' : `${s}배속`}
            aria-pressed={speed === s}
          >
            {s === 0 ? '❚❚' : `${s}x`}
          </button>
        ))}
      </div>
      <span className="mx-0.5 my-2 w-px bg-line" />
      <div className="flex min-w-[64px] flex-col items-end justify-center px-2 leading-tight" title="가상 업무 시간 (1 tick = 1분)">
        <span className={`font-mono text-[13px] font-semibold tabular-nums ${speed === 0 ? 'text-amber-200' : 'text-strong'}`}>{formatSimTime(sim.tick)}</span>
        <span className={`text-[10px] ${speed === 0 ? 'text-amber-300/80' : 'text-faint'}`}>{speed === 0 ? '일시정지됨' : '가상 업무 시간'}</span>
      </div>
    </>
  );
}
