import { Fragment, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useSession } from '../../store/session';
import { allTerms, disposeTerm, syncTerm } from './termRegistry';
import TerminalPane from './TerminalPane';

export function ResizeHandle({ dir }: { dir: 'h' | 'v' }) {
  return (
    <PanelResizeHandle
      className={`group relative ${dir === 'h' ? 'w-1.5' : 'h-1.5'} flex items-center justify-center data-[resize-handle-state=drag]:bg-sky-500/30 data-[resize-handle-state=hover]:bg-sky-500/20`}
    >
      <div className={`${dir === 'h' ? 'h-8 w-px' : 'h-px w-8'} bg-line2 group-hover:bg-sky-500`} />
    </PanelResizeHandle>
  );
}

export default function TerminalGrid() {
  const panes = useSession((s) => s.panes);
  const maximized = useSession((s) => s.maximizedPane);
  const version = useSession((s) => s.version);

  // 엔진 이벤트 → 터미널 동기화
  useEffect(() => {
    for (const t of allTerms()) syncTerm(t);
  }, [version]);

  // 닫힌 패널 정리
  useEffect(() => {
    for (const t of allTerms()) if (!panes.some((p) => p.id === t.paneId)) disposeTerm(t.paneId);
  }, [panes]);

  // 키보드: Alt+1..9 패널 이동, Alt+Enter 최대화
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const st = useSession.getState();
      const m = e.code.match(/^Digit([1-9])$/);
      if (m) {
        const p = st.panes[Number(m[1]) - 1];
        if (p) {
          e.preventDefault();
          st.focusPane(p.id);
          if (st.maximizedPane) st.toggleMaximize(p.id);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        st.toggleMaximize(st.focusedPane);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const visible = maximized ? panes.filter((p) => p.id === maximized) : panes;
  const cols = visible.length <= 1 ? 1 : visible.length <= 4 ? 2 : 3;
  const rows: (typeof panes)[] = [];
  for (let i = 0; i < visible.length; i += cols) rows.push(visible.slice(i, i + cols));
  const key = visible.map((p) => p.id).join('|');

  return (
    <PanelGroup key={key} direction="vertical" className="h-full p-1.5">
      {rows.map((row, ri) => (
        <Fragment key={ri}>
          {ri > 0 && <ResizeHandle dir="v" />}
          <Panel minSize={15}>
            <PanelGroup direction="horizontal">
              {row.map((p, ci) => (
                <Fragment key={p.id}>
                  {ci > 0 && <ResizeHandle dir="h" />}
                  <Panel minSize={15}>
                    <TerminalPane paneId={p.id} agentId={p.agentId} personId={p.personId} index={panes.indexOf(p)} />
                  </Panel>
                </Fragment>
              ))}
            </PanelGroup>
          </Panel>
        </Fragment>
      ))}
    </PanelGroup>
  );
}
