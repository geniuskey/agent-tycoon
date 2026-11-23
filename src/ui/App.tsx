import { useEffect, useState } from 'react';
import { useSession } from '../store/session';
import Home from './Home';
import Workspace from './Workspace';
import Feedback from './Feedback';
import { preloadTermFont } from './terminal/termRegistry';

export default function App() {
  const screen = useSession((s) => s.screen);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    // 새로고침 후 진행 중이던 세션 자동 복구
    void Promise.all([
      preloadTermFont(),
      useSession
        .getState()
        .restoreActive()
        .then(() => useSession.getState().refreshSessions()),
    ]).finally(() => setBooted(true));
  }, []);

  if (!booted) return <div className="flex h-full items-center justify-center text-dim">세션 복구 중…</div>;
  if (screen === 'workspace') return <Workspace />;
  if (screen === 'feedback') return <Feedback />;
  return <Home />;
}
