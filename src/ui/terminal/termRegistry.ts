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

export const TERM_FONT = "'D2Coding', Menlo, Consolas, monospace";
export const TERM_FONT_SIZE = 13;

/** xterm은 생성 시점의 글꼴로 셀 크기를 잰다 — 터미널을 만들기 전에 D2Coding을 내려받아 둔다. */
export function preloadTermFont(timeoutMs = 3000): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const load = document.fonts.load(`${TERM_FONT_SIZE}px 'D2Coding'`, '가A').then(() => undefined);
  return Promise.race([load, new Promise<void>((r) => setTimeout(r, timeoutMs))]).catch(() => undefined);
}

const THEME = {
  background: '#1e1f22',
  foreground: '#dfe1e5',
  cursor: '#ced0d6',
  cursorAccent: '#1e1f22',
  selectionBackground: '#214283',
  black: '#2b2d30',
  red: '#f0717e',
  green: '#6aab73',
  yellow: '#e5b85c',
  blue: '#56a8f5',
  magenta: '#c77dbb',
  cyan: '#2aacb8',
  white: '#dfe1e5',
  brightBlack: '#7a7e85',
  brightRed: '#f59ea6',
  brightGreen: '#8fcf93',
  brightYellow: '#f0d48f',
  brightBlue: '#94b5f7',
  brightMagenta: '#d9a4d0',
  brightCyan: '#7fc8cd',
  brightWhite: '#ffffff',
};

/** Agent 고유색(24-bit)으로 프롬프트를 칠해 패널 머리·사이드바와 같은 색으로 이어지게 한다. */
function rgb(hex: string, text: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `\x1b[1;38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m${text}\x1b[0m`;
}

export function promptOf(inst: Pick<TermInstance, 'agentId'> & { sim?: Simulation | null }): string {
  return inst.agentId ? rgb(agentColor(inst.sim, inst.agentId), `${inst.agentId} `) + c.cyan('❯ ') : c.cyan('❯ ');
}

export function getTerm(
  paneId: string,
  agentId: string | undefined,
  sim: Simulation | null,
  onSubmit: (t: string) => void,
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
    // D2Coding이 첫 글꼴이어야 셀 폭(0.5em)과 한글 폭(1em)이 2:1로 맞는다. 앞에 다른 라틴 글꼴을 두면 한글 사이가 벌어진다.
    fontFamily: TERM_FONT,
    fontSize: TERM_FONT_SIZE,
    rescaleOverlappingGlyphs: true,
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
  // herdr처럼 드래그(또는 더블클릭) 선택이 끝나면 곧바로 클립보드에 넣는다
  el.addEventListener('mouseup', () => {
    if (term.hasSelection()) void copySelection(i, false);
  });
  registry.set(paneId, inst);
  return inst;
}

/** 클립보드 복사 — https/localhost에서는 Clipboard API, 그 밖(사내망 http 등)에서는 execCommand로 대체 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 아래 대체 경로 */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  const prev = document.activeElement as HTMLElement | null;
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  prev?.focus();
  return ok;
}

/** 선택 영역을 복사하고, 패널이 '복사됨'을 띄울 수 있게 이벤트를 보낸다. clear=true면 선택을 지운다(Ctrl+C). */
export async function copySelection(inst: TermInstance, clear: boolean): Promise<boolean> {
  // 줄 끝 공백은 셀 채움일 뿐이므로 걷어낸다
  const text = inst.term.getSelection().replace(/[ \t]+$/gm, '');
  const ok = await copyText(text);
  if (clear) inst.term.clearSelection();
  inst.el.dispatchEvent(new CustomEvent('term-copied', { detail: { ok, chars: [...text].length } }));
  return ok;
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
  if (inst.agentId) return e.agentId === inst.agentId && e.type === 'agent.log';
  // 셸 패널: 알림
  return e.type === 'notify' || e.type === 'session.start' || e.type === 'task.activated';
}

function render(inst: TermInstance, e: SimEvent): string | null {
  switch (e.type) {
    case 'command':
      // 객관식 선택은 구조화 명령으로 기록되지만, Agent 패널에는 '> 프롬프트' 로그로 보인다
      if (inst.agentId && /^(do|ask|agent choose)\s/.test(e.message)) return null;
      return promptOf(inst) + e.message;
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
  const body = out.length ? out.join('\n').replace(/\n/g, '\r\n') + '\r\n' : '';
  if (cleared) {
    eraseInput(inst);
    inst.term.clear();
    inst.term.write(body + promptSeq(inst));
  } else {
    inst.term.write(eraseSeq(inst) + body + promptSeq(inst));
  }
}

// ───────────── line editor ─────────────

function eraseSeq(inst: TermInstance): string {
  const s = (inst.cursorRow > 0 ? `\x1b[${inst.cursorRow}A` : '') + '\r\x1b[J';
  inst.cursorRow = 0;
  return s;
}

function eraseInput(inst: TermInstance) {
  inst.term.write(eraseSeq(inst));
}

/**
 * 프롬프트+입력을 그리는 이스케이프 문자열. withPrompt=false면 커서가 이미 프롬프트 끝(0행)에 있다고 보고 입력만 그린다.
 * 호출 전 커서는 입력 영역 0행 0열(withPrompt) 또는 0행 프롬프트 끝에 있어야 한다.
 */
function promptSeq(inst: TermInstance, withPrompt = true): string {
  inst.drawn = true;
  const cols = Math.max(10, inst.term.cols);
  const prompt = promptOf(inst);
  let s = (withPrompt ? prompt : '') + inst.buf;
  const pw = displayWidth(stripAnsi(prompt));
  const total = pw + displayWidth(inst.buf);
  const cur = pw + displayWidth(inst.buf.slice(0, inst.cursor));
  // 출력 후 커서 위치 (pending wrap 고려)
  const endRow = total > 0 && total % cols === 0 ? total / cols - 1 : Math.floor(total / cols);
  const endCol = total > 0 && total % cols === 0 ? cols : total % cols;
  const tRow = Math.floor(cur / cols);
  const tCol = cur % cols;
  if (endRow !== tRow || endCol !== tCol) {
    if (endRow > tRow) s += `\x1b[${endRow - tRow}A`;
    else if (tRow > endRow) s += `\x1b[${tRow - endRow}B`;
    s += '\r';
    if (tCol > 0) s += `\x1b[${tCol}C`;
  }
  inst.cursorRow = tRow;
  return s;
}

function drawPrompt(inst: TermInstance) {
  inst.term.write(promptSeq(inst));
}

/** 키 입력마다 호출 — 프롬프트 셀은 건드리지 않고 그 뒤 입력만 한 번의 write로 다시 그려 깜빡임을 없앤다. */
function redraw(inst: TermInstance) {
  const pw = displayWidth(stripAnsi(promptOf(inst)));
  if (pw >= Math.max(10, inst.term.cols)) {
    inst.term.write(eraseSeq(inst) + promptSeq(inst));
    return;
  }
  const up = inst.cursorRow > 0 ? `\x1b[${inst.cursorRow}A` : '';
  inst.cursorRow = 0;
  inst.term.write(up + '\r' + (pw > 0 ? `\x1b[${pw}C` : '') + '\x1b[J' + promptSeq(inst, false));
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
      {
        const head = eraseSeq(inst) + promptOf(inst) + inst.buf + c.dim('^C') + '\r\n';
        inst.buf = '';
        inst.cursor = 0;
        inst.term.write(head + promptSeq(inst));
      }
      return;
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
  const erase = eraseSeq(inst);
  inst.buf = '';
  inst.cursor = 0;
  inst.histIdx = -1;
  if (!text) {
    inst.term.write(erase + promptOf(inst) + '\r\n' + promptSeq(inst));
    return;
  }
  if (inst.history[0] !== text) inst.history.unshift(text);
  inst.term.write(erase + promptSeq(inst));
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
    const erase = eraseSeq(inst);
    inst.term.write(erase + promptOf(inst) + inst.buf + '\r\n' + c.dim(cands.slice(0, 40).join('   ')) + '\r\n' + promptSeq(inst));
  }
}
