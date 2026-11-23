import { create } from 'zustand';
import { Simulation, replay } from '../engine/engine';
import { getScenario } from '../scenarios';
import type { SimEvent } from '../engine/types';
import {
  type PaneLayout,
  type SessionRecord,
  getActiveSessionId,
  listSessions,
  saveSession,
  setActiveSessionId,
} from './persist';

export type Screen = 'home' | 'workspace' | 'feedback';
export type RightTab = 'browser' | 'files' | 'preview';

export const TICK_MS = 450;

interface SessionState {
  screen: Screen;
  sim: Simulation | null;
  version: number;
  sessionId: string | null;
  createdAt: number;
  speed: number; // 0 = paused
  panes: PaneLayout[];
  focusedPane: string;
  maximizedPane: string | null;
  rightTab: RightTab;
  browserUrl: string;
  browserHistory: string[];
  browserIndex: number;
  previewPath: string | null;
  showBriefing: boolean;
  feedbackSessionId: string | null;
  sessions: SessionRecord[];
  /** 마지막으로 처리한 ui.request 이벤트 seq (재생 시 UI 액션 중복 방지) */
  uiSeq: number;

  refreshSessions: () => Promise<void>;
  start: (scenarioId: string, seed: number) => void;
  resume: (rec: SessionRecord) => void;
  restoreActive: () => Promise<boolean>;
  goHome: () => void;
  showFeedback: (rec?: SessionRecord) => void;
  setSpeed: (s: number) => void;
  input: (paneId: string, text: string) => void;
  openAgentPane: (agentId: string, focus?: boolean) => void;
  addShellPane: () => void;
  closePane: (paneId: string) => void;
  focusPane: (paneId: string) => void;
  toggleMaximize: (paneId: string) => void;
  setRightTab: (t: RightTab) => void;
  navigate: (url: string) => void;
  browserBack: () => void;
  browserForward: () => void;
  openFile: (path: string) => void;
  setShowBriefing: (v: boolean) => void;
  persist: () => void;
}

let unsub: (() => void) | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const newId = () => `s-${Date.now().toString(36)}-${Math.floor(performance.now() * 1000).toString(36).slice(-4)}`;

export const useSession = create<SessionState>((set, get) => {
  function attach(sim: Simulation) {
    unsub?.();
    unsub = sim.subscribe(() => {
      set((s) => ({ version: s.version + 1 }));
      processUiRequests();
    });
  }

  function processUiRequests() {
    const { sim, uiSeq } = get();
    if (!sim) return;
    const evs = sim.events;
    let i = evs.length - 1;
    while (i >= 0 && evs[i].seq > uiSeq) i--;
    const fresh: SimEvent[] = evs.slice(i + 1);
    if (!fresh.length) return;
    set({ uiSeq: fresh[fresh.length - 1].seq });
    for (const e of fresh) {
      if (e.type === 'command') get().persist();
      if (e.type !== 'ui.request') continue;
      const action = e.data?.action;
      if (action === 'agent-pane' && e.agentId) get().openAgentPane(e.agentId, false);
      else if (action === 'open-page') {
        get().navigate(e.data!.url as string);
        set({ rightTab: 'browser' });
      } else if (action === 'open-file') get().openFile(e.data!.path as string);
      else if (action === 'feedback') {
        get().persist();
        setTimeout(() => get().showFeedback(), 900);
      }
    }
  }

  function boot(sim: Simulation, rec: Partial<SessionRecord> & { id: string; createdAt: number }) {
    const panes = rec.panes?.length ? rec.panes : [{ id: 'shell-1' }];
    set({
      sim,
      sessionId: rec.id,
      createdAt: rec.createdAt,
      version: 0,
      screen: sim.submitted ? 'feedback' : 'workspace',
      feedbackSessionId: sim.submitted ? rec.id : null,
      panes,
      focusedPane: panes[0].id,
      maximizedPane: null,
      rightTab: 'browser',
      browserUrl: 'sim://home',
      browserHistory: ['sim://home'],
      browserIndex: 0,
      previewPath: null,
      speed: 1,
      uiSeq: sim.events[sim.events.length - 1]?.seq ?? 0,
    });
    attach(sim);
    setActiveSessionId(sim.submitted ? null : rec.id);
  }

  return {
    screen: 'home',
    sim: null,
    version: 0,
    sessionId: null,
    createdAt: 0,
    speed: 1,
    panes: [{ id: 'shell-1' }],
    focusedPane: 'shell-1',
    maximizedPane: null,
    rightTab: 'browser',
    browserUrl: 'sim://home',
    browserHistory: ['sim://home'],
    browserIndex: 0,
    previewPath: null,
    showBriefing: false,
    feedbackSessionId: null,
    sessions: [],
    uiSeq: 0,

    refreshSessions: async () => set({ sessions: await listSessions() }),

    start: (scenarioId, seed) => {
      const scenario = getScenario(scenarioId);
      if (!scenario) return;
      const sim = new Simulation(scenario, seed);
      boot(sim, { id: newId(), createdAt: Date.now() });
      set({ showBriefing: true });
      sim.input('brief', { paneId: 'shell-1' });
      get().persist();
    },

    resume: (rec) => {
      const scenario = getScenario(rec.scenarioId);
      if (!scenario) return;
      const sim = replay(scenario, rec.seed, rec.commands, rec.tick);
      boot(sim, rec);
    },

    restoreActive: async () => {
      const id = getActiveSessionId();
      if (!id) return false;
      const rec = (await listSessions()).find((r) => r.id === id);
      if (!rec || rec.submitted) return false;
      get().resume(rec);
      return true;
    },

    goHome: () => {
      get().persist();
      unsub?.();
      unsub = null;
      setActiveSessionId(null);
      set({ screen: 'home', sim: null, sessionId: null });
      void get().refreshSessions();
    },

    showFeedback: (rec) => {
      if (rec) {
        const scenario = getScenario(rec.scenarioId);
        if (!scenario) return;
        const sim = replay(scenario, rec.seed, rec.commands, rec.tick);
        unsub?.();
        unsub = null;
        set({ sim, sessionId: rec.id, createdAt: rec.createdAt, panes: rec.panes, feedbackSessionId: rec.id, screen: 'feedback' });
        return;
      }
      setActiveSessionId(null);
      set({ screen: 'feedback', feedbackSessionId: get().sessionId, speed: 0 });
    },

    setSpeed: (speed) => set({ speed }),

    input: (paneId, text) => {
      const { sim, panes } = get();
      if (!sim) return;
      const pane = panes.find((p) => p.id === paneId);
      sim.input(text, { paneId, agentId: pane?.agentId });
    },

    openAgentPane: (agentId, focus = true) => {
      const id = `agent:${agentId}`;
      const { panes } = get();
      if (!panes.some((p) => p.id === id)) set({ panes: [...panes, { id, agentId }] });
      if (focus) set({ focusedPane: id, maximizedPane: get().maximizedPane ? id : null });
      get().persist();
    },

    addShellPane: () => {
      const { panes } = get();
      let n = 1;
      while (panes.some((p) => p.id === `shell-${n}`)) n++;
      set({ panes: [...panes, { id: `shell-${n}` }], focusedPane: `shell-${n}` });
      get().persist();
    },

    closePane: (paneId) => {
      const panes = get().panes.filter((p) => p.id !== paneId);
      if (!panes.length) panes.push({ id: 'shell-1' });
      set({
        panes,
        focusedPane: get().focusedPane === paneId ? panes[0].id : get().focusedPane,
        maximizedPane: get().maximizedPane === paneId ? null : get().maximizedPane,
      });
      get().persist();
    },

    focusPane: (paneId) => set({ focusedPane: paneId }),
    toggleMaximize: (paneId) => set({ maximizedPane: get().maximizedPane === paneId ? null : paneId, focusedPane: paneId }),
    setRightTab: (rightTab) => set({ rightTab }),

    navigate: (url) => {
      const { browserHistory, browserIndex, sim } = get();
      const hist = [...browserHistory.slice(0, browserIndex + 1), url];
      set({ browserUrl: url, browserHistory: hist, browserIndex: hist.length - 1, rightTab: 'browser' });
      if (sim && url !== 'sim://home') {
        const page = sim.scenario.pages.find((p) => p.url === url);
        if (page && sim.files.has(page.source)) sim.observe('page', url);
      }
    },
    browserBack: () => {
      const { browserIndex, browserHistory } = get();
      if (browserIndex > 0) set({ browserIndex: browserIndex - 1, browserUrl: browserHistory[browserIndex - 1] });
    },
    browserForward: () => {
      const { browserIndex, browserHistory } = get();
      if (browserIndex < browserHistory.length - 1)
        set({ browserIndex: browserIndex + 1, browserUrl: browserHistory[browserIndex + 1] });
    },

    openFile: (path) => {
      const { sim } = get();
      set({ previewPath: path, rightTab: 'preview' });
      sim?.observe('file', path);
    },

    setShowBriefing: (showBriefing) => set({ showBriefing }),

    persist: () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const { sim, sessionId, createdAt, panes } = get();
        if (!sim || !sessionId) return;
        void saveSession({
          id: sessionId,
          scenarioId: sim.scenario.id,
          scenarioTitle: sim.scenario.title,
          seed: sim.seed,
          commands: sim.commands,
          tick: sim.tick,
          createdAt,
          updatedAt: Date.now(),
          submitted: sim.submitted,
          panes,
        });
      }, 300);
    },
  };
});
