import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { c, displayWidth, stripAnsi } from '../../engine/ansi';
import { completions } from '../../engine/cli';
import { formatSimTime } from '../../engine/engine';
import type { Simulation } from '../../engine/engine';
import type { SimEvent } from '../../engine/types';
import { agentColor } from '../agentColor';

/**
 * xterm 인스턴스 레지스트리.
 * React 리렌더/레이아웃 변경(분할, 최대화)에도 터미널 상태가 유지되도록
 * 패널별 Terminal과 컨테이너 DOM을 React 바깥에서 보관한다.
 *
 * 출력은 엔진 이벤트의 투영(projection)이다: 패널과 관련된 이벤트를 seq 순서로 렌더링하므로
 * 새로고침 후에도 동일한 화면이 복원된다.
 */

export interface TermInstance {
  paneId: string;
  agentId?: string;
  personId?: string;
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  el: HTMLDivElement;
  lastSeq: number;
  buf: string;
  cursor: number;
  cursorRow: number;
  history: string[];
  histIdx: number;
  draft: string;
  onSubmit: (text: string) => void;
  sim: Simulation | null;
  opened: boolean;
  drawn: boolean;
}

const registry = new Map<string, TermInstance>();

const THEME = {
  background: '#0a0c10',
  foreground: '#d7dde8',
  cursor: '#38bdf8',
  cursorAccent: '#0a0c10',
  selectionBackground: '#264f78',
  black: '#1e2533',
  red: '#f87171',
  green: '#34d399',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#e879f9',
  cyan: '#22d3ee',
  white: '#e5e7eb',
  brightBlack: '#6b7689',
  brightRed: '#fca5a5',
  brightGreen: '#6ee7b7',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#f0abfc',
  brightCyan: '#67e8f9',
  brightWhite: '#f8fafc',
};

/** Agent 고유색(24-bit)으로 프롬프트를 칠해 패널 머리·사이드바와 같은 색으로 이어지게 한다. */
function rgb(hex: string, text: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `\x1b[1;38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m${text}\x1b[0m`;
}

export function promptOf(inst: Pick<TermInstance, 'agentId' | 'personId'> & { sim?: Simulation | null }): string {
  if (inst.personId) return c.yellow('나 ') + c.cyan('❯ ');
  return inst.agentId ? rgb(agentColor(inst.sim, inst.agentId), `${inst.agentId} `) + c.cyan('❯ ') : c.cyan('❯ ');
}

export function getTerm(
  paneId: string,
  agentId: string | undefined,
  sim: Simulation | null,
  onSubmit: (t: string) => void,
  personId?: string,
): TermInstance {
  let inst = registry.get(paneId);
  if (inst) {
    inst.onSubmit = onSubmit;
    if (inst.sim !== sim) {
      // 다른 세션 → 재생성
      disposeTerm(paneId);
      inst = undefined;
    }
  }
  if (inst) return inst;
  const term = new Terminal({
    allowProposedApi: true,
    fontFamily: "'JetBrains Mono', 'D2Coding', 'SF Mono', Menlo, Consolas, monospace",
    fontSize: 12.5,
    lineHeight: 1.25,
    cursorBlink: true,
    convertEol: true,
    scrollback: 5000,
    theme: THEME,
  });
  const fit = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  const uni = new Unicode11Addon();
  term.loadAddon(uni);
  term.unicode.activeVersion = '11';
  const el = document.createElement('div');
  el.style.height = '100%';
  el.style.width = '100%';
  inst = {
    paneId,
    agentId,
    personId,
    term,
    fit,
    search,
    el,
    lastSeq: 0,
    buf: '',
    cursor: 0,
    cursorRow: 0,
    history: [],
    histIdx: -1,
    draft: '',
    onSubmit,
    sim,
    opened: false,
    drawn: false,
  };
  const i = inst;
  term.onData((d) => handleData(i, d));
  registry.set(paneId, inst);
  return inst;
}

export function disposeTerm(paneId: string) {
  const inst = registry.get(paneId);
  if (!inst) return;
  inst.term.dispose();
  inst.el.remove();
  registry.delete(paneId);
}

export function disposeAll() {
  for (const id of [...registry.keys()]) disposeTerm(id);
}

export function allTerms(): TermInstance[] {
  return [...registry.values()];
}

/** DOM에 부착 (최초 1회 open) */
export function mountTerm(inst: TermInstance, host: HTMLElement) {
  if (inst.el.parentElement !== host) host.appendChild(inst.el);
  if (!inst.opened) {
    inst.term.open(inst.el);
    inst.opened = true;
    try {
      inst.fit.fit();
    } catch {
      /* not visible yet */
    }
    inst.history = (inst.sim?.events ?? [])
      .filter((e) => e.type === 'command' && e.paneId === inst.paneId)
      .map((e) => e.message)
      .reverse()
      .slice(0, 100);
    syncTerm(inst);
    if (!inst.drawn) drawPrompt(inst);
  }
}

export function fitTerm(inst: TermInstance) {
  if (!inst.opened || !inst.el.isConnected || inst.el.clientWidth < 20) return;
  try {
    inst.fit.fit();
  } catch {
    /* ignore */
  }
}

// ───────────── event projection ─────────────

function relevant(inst: TermInstance, e: SimEvent): boolean {
  if (e.paneId === inst.paneId && (e.type === 'cli.output' || e.type === 'command')) return true;
  if (e.type === 'ui.request' && e.paneId === inst.paneId && e.data?.action === 'clear') return true;
  if (inst.personId) return e.personId === inst.personId && (e.type === 'person.said' || e.type === 'person.trust');
  if (inst.agentId) return e.agentId === inst.agentId && e.type === 'agent.log';
  // 셸 패널: 알림
  return e.type === 'notify' || e.type === 'session.start' || e.type === 'task.activated';
}

function render(inst: TermInstance, e: SimEvent): string | null {
  switch (e.type) {
    case 'command':
      // 객관식 선택은 구조화 명령으로 기록되지만, Agent 패널에는 '▸ 지시' 로그로 보인다
      if (inst.agentId && /^(do|ask|agent choose)\s/.test(e.message)) return null;
      return inst.personId ? null : promptOf(inst) + e.message;
    case 'person.said': {
      if (e.data?.from === 'player' || e.data?.system) return e.message;
      const name = inst.sim?.personDef(inst.personId!)?.name ?? '';
      return c.yellow(c.bold(name)) + c.dim(' ▸ ') + e.message;
    }
    case 'person.trust': {
      const d = e.data?.delta as number;
      return c.dim(`  (신뢰 ${e.data?.from} → ${e.data?.to} `) + (d > 0 ? c.green(`▲${d}`) : c.red(`▼${-d}`)) + c.dim(')');
    }
    case 'cli.output':
    case 'agent.log':
      return e.message;
    case 'session.start':
      return c.dim(`── ${e.message} ──`) + '\n' + c.dim("  'help' 명령 목록 · 'hint' 힌트 · Tab 자동완성");
    case 'task.activated':
      return c.magenta(`[${formatSimTime(e.tick)}] ＋ ${e.message}`);
    case 'notify': {
      const lvl = e.data?.level as string;
      const icon = lvl === 'error' ? c.red('✗') : lvl === 'warn' ? c.yellow('⏸') : lvl === 'success' ? c.green('✔') : c.cyan('ℹ');
      return c.dim(`[${formatSimTime(e.tick)}] `) + icon + ' ' + (lvl === 'error' ? c.red(e.message) : lvl === 'warn' ? c.yellow(e.message) : e.message);
    }
  }
  return null;
}

/** 새 이벤트를 터미널에 기록 */
export function syncTerm(inst: TermInstance) {
  const sim = inst.sim;
  if (!sim || !inst.opened) return;
  const evs = sim.events;
  if (!evs.length || evs[evs.length - 1].seq <= inst.lastSeq) return;
  // 이진 탐색으로 시작 위치
  let lo = 0;
  let hi = evs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (evs[mid].seq <= inst.lastSeq) lo = mid + 1;
    else hi = mid;
  }
  const out: string[] = [];
  let cleared = false;
  for (let i = lo; i < evs.length; i++) {
    const e = evs[i];
    if (!relevant(inst, e)) continue;
    if (e.type === 'ui.request') {
      out.length = 0;
      cleared = true;
      continue;
    }
    const r = render(inst, e);
    if (r !== null) out.push(r);
  }
  inst.lastSeq = evs[evs.length - 1].seq;
  if (!out.length && !cleared) return;
  eraseInput(inst);
  if (cleared) inst.term.clear();
  if (out.length) inst.term.write(out.join('\n').replace(/\n/g, '\r\n') + '\r\n');
  drawPrompt(inst);
}

// ───────────── line editor ─────────────

function eraseInput(inst: TermInstance) {
  if (inst.cursorRow > 0) inst.term.write(`\x1b[${inst.cursorRow}A`);
  inst.term.write('\r\x1b[J');
  inst.cursorRow = 0;
}

function drawPrompt(inst: TermInstance) {
  inst.drawn = true;
  const cols = Math.max(10, inst.term.cols);
  const prompt = promptOf(inst);
  inst.term.write(prompt + inst.buf);
  const pw = displayWidth(stripAnsi(prompt));
  const total = pw + displayWidth(inst.buf);
  const cur = pw + displayWidth(inst.buf.slice(0, inst.cursor));
  // 출력 후 커서 위치 (pending wrap 고려)
  const endRow = total > 0 && total % cols === 0 ? total / cols - 1 : Math.floor(total / cols);
  const endCol = total > 0 && total % cols === 0 ? cols : total % cols;
  const tRow = Math.floor(cur / cols);
  const tCol = cur % cols;
  if (endRow !== tRow || endCol !== tCol) {
    if (endRow > tRow) inst.term.write(`\x1b[${endRow - tRow}A`);
    else if (tRow > endRow) inst.term.write(`\x1b[${tRow - endRow}B`);
    inst.term.write('\r');
    if (tCol > 0) inst.term.write(`\x1b[${tCol}C`);
  }
  inst.cursorRow = tRow;
}

function redraw(inst: TermInstance) {
  eraseInput(inst);
  drawPrompt(inst);
}

function setBuf(inst: TermInstance, text: string) {
  inst.buf = text;
  inst.cursor = text.length;
  redraw(inst);
}

function handleData(inst: TermInstance, data: string) {
  // 붙여넣기 다중 라인
  if (data.length > 1 && data.includes('\r') && !data.startsWith('\x1b')) {
    const lines = data.split(/\r\n|\r|\n/);
    lines.forEach((l, i) => {
      if (i < lines.length - 1) {
        inst.buf = inst.buf.slice(0, inst.cursor) + l + inst.buf.slice(inst.cursor);
        inst.cursor += l.length;
        submit(inst);
      } else if (l) insert(inst, l);
    });
    return;
  }
  switch (data) {
    case '\r':
      return submit(inst);
    case '\x7f':
    case '\b':
      if (inst.cursor > 0) {
        const chars = [...inst.buf.slice(0, inst.cursor)];
        const removed = chars.pop()!;
        inst.buf = chars.join('') + inst.buf.slice(inst.cursor);
        inst.cursor -= removed.length;
        redraw(inst);
      }
      return;
    case '\x1b[3~': // delete
      if (inst.cursor < inst.buf.length) {
        const rest = [...inst.buf.slice(inst.cursor)];
        rest.shift();
        inst.buf = inst.buf.slice(0, inst.cursor) + rest.join('');
        redraw(inst);
      }
      return;
    case '\x1b[D':
      if (inst.cursor > 0) {
        const chars = [...inst.buf.slice(0, inst.cursor)];
        inst.cursor -= chars[chars.length - 1].length;
        redraw(inst);
      }
      return;
    case '\x1b[C':
      if (inst.cursor < inst.buf.length) {
        const ch = [...inst.buf.slice(inst.cursor)][0];
        inst.cursor += ch.length;
        redraw(inst);
      }
      return;
    case '\x1b[H':
    case '\x01':
      inst.cursor = 0;
      return redraw(inst);
    case '\x1b[F':
    case '\x05':
      inst.cursor = inst.buf.length;
      return redraw(inst);
    case '\x1b[A':
      if (!inst.history.length) return;
      if (inst.histIdx === -1) inst.draft = inst.buf;
      inst.histIdx = Math.min(inst.history.length - 1, inst.histIdx + 1);
      return setBuf(inst, inst.history[inst.histIdx]);
    case '\x1b[B':
      if (inst.histIdx === -1) return;
      inst.histIdx--;
      return setBuf(inst, inst.histIdx === -1 ? inst.draft : inst.history[inst.histIdx]);
    case '\x03': // Ctrl+C
      eraseInput(inst);
      inst.term.write(promptOf(inst) + inst.buf + c.dim('^C') + '\r\n');
      inst.buf = '';
      inst.cursor = 0;
      return drawPrompt(inst);
    case '\x0c': // Ctrl+L
      inst.term.clear();
      return redraw(inst);
    case '\x15': // Ctrl+U
      inst.buf = inst.buf.slice(inst.cursor);
      inst.cursor = 0;
      return redraw(inst);
    case '\t':
      return complete(inst);
  }
  if (data.startsWith('\x1b')) return;
  // 제어문자 제거
  const clean = data.replace(/[\x00-\x1f]/g, '');
  if (clean) insert(inst, clean);
}

function insert(inst: TermInstance, text: string) {
  inst.buf = inst.buf.slice(0, inst.cursor) + text + inst.buf.slice(inst.cursor);
  inst.cursor += text.length;
  redraw(inst);
}

function submit(inst: TermInstance) {
  const text = inst.buf.trim();
  eraseInput(inst);
  inst.buf = '';
  inst.cursor = 0;
  inst.histIdx = -1;
  if (!text) {
    inst.term.write(promptOf(inst) + '\r\n');
    drawPrompt(inst);
    return;
  }
  if (inst.history[0] !== text) inst.history.unshift(text);
  drawPrompt(inst);
  inst.onSubmit(text);
}

function complete(inst: TermInstance) {
  if (!inst.sim) return;
  const before = inst.buf.slice(0, inst.cursor);
  const cands = completions(inst.sim, before);
  if (!cands.length) return;
  const parts = before.split(/\s+/);
  const last = parts[parts.length - 1];
  let common = cands[0];
  for (const x of cands) {
    let i = 0;
    while (i < common.length && i < x.length && common[i] === x[i]) i++;
    common = common.slice(0, i);
  }
  if (cands.length === 1) common = cands[0] + ' ';
  if (common.length > last.length) {
    insert(inst, common.slice(last.length));
  } else if (cands.length > 1) {
    eraseInput(inst);
    inst.term.write(promptOf(inst) + inst.buf + '\r\n' + c.dim(cands.slice(0, 40).join('   ')) + '\r\n');
    drawPrompt(inst);
  }
}
