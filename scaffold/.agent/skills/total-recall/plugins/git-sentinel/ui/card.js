/**
 * Git Hygiene — repository hygiene.
 *
 * This face answers one question with a deadline attached: is this repository
 * safe to walk away from? So it leads with unpushed commits, then conflicts,
 * then the four-way dirty split — ordered by the consequence of ignoring each.
 *
 * Every value comes from the returned payload. A value the command did not
 * supply renders an em dash with its reason; nothing is seeded and nothing is
 * defaulted to a reassuring word.
 *
 * Design rationale: ui/DESIGN.md. Requirements: GITSENTINEL_CARD_BESPOKE_PRD.md.
 */

const DASH = '\u2014';

/** Upstream states the command distinguishes, and whether each needs action. */
const UPSTREAM_STATES = {
  tracking: { label: 'tracking', action: false },
  none: { label: 'no upstream', action: false },
  gone: { label: 'upstream gone', action: true },
  detached: { label: 'detached HEAD', action: false },
  unborn: { label: 'no commits yet', action: false },
  unknown: { label: 'unresolved', action: true },
  error: { label: 'check failed', action: true },
};

/** The four dirty categories, each with the action it implies. */
const DIRTY_ROWS = [
  { key: 'stagedFiles', label: 'staged', action: 'stage and commit' },
  { key: 'unstagedFiles', label: 'unstaged', action: 'review and commit' },
  { key: 'untrackedFiles', label: 'untracked', action: 'decide whether to track' },
  { key: 'conflictedFiles', label: 'conflicted', action: 'resolve before anything else' },
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** A count only when the payload supplied a real number. */
function count(payload, key) {
  const value = payload ? payload[key] : undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function text(payload, key) {
  const value = payload ? payload[key] : undefined;
  return typeof value === 'string' && value ? value : undefined;
}

function asObject(result) {
  if (result === null || result === undefined) return null;
  if (typeof result === 'object') {
    if (typeof result.output === 'string') {
      try { const parsed = JSON.parse(result.output); return typeof parsed === 'object' ? parsed : null; } catch { return null; }
    }
    return result;
  }
  if (typeof result === 'string') {
    try { const parsed = JSON.parse(result); return typeof parsed === 'object' ? parsed : null; } catch { return null; }
  }
  return null;
}

function rawText(result) {
  if (result === null || result === undefined) return '';
  if (typeof result === 'string') return result;
  if (typeof result.output === 'string') return result.output;
  try { return JSON.stringify(result, null, 2); } catch { return String(result); }
}

export class GitSentinelCard extends HTMLElement {
  constructor() {
    super();
    this.state = 'loading';
    this.audit = null;
    this.auditRaw = '';
    this.diff = null;
    this.diffRaw = '';
    this.lastError = null;
    this.lastAttempt = null;
    this.busy = false;
    this.screen = 'hygiene';
  }

  /** Screens this face offers; the host only provides the flipper. */
  get screens() {
    return [
      { id: 'hygiene', label: 'Hygiene' },
      { id: 'changes', label: 'Changes' },
      { id: 'upstream', label: 'Upstream' },
      { id: 'provenance', label: 'Provenance' },
    ];
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.render();
    this.onScreen = (event) => {
      const detail = event.detail || {};
      if (detail.pluginId && detail.pluginId !== this.host?.pluginId) return;
      if (detail.screen && this.screens.some((s) => s.id === detail.screen)) this.show(detail.screen);
    };
    window.addEventListener('plugin-show-screen', this.onScreen);
    void this.read();
  }

  disconnectedCallback() {
    if (this.onScreen) window.removeEventListener('plugin-show-screen', this.onScreen);
  }

  /* ------------------------------------------------------------------ data */

  async call(subcommand, args) {
    if (!this.host || typeof this.host.run !== 'function') {
      throw new Error('The host did not provide a command runner, so the repository cannot be inspected.');
    }
    return this.host.run(subcommand, args);
  }

  /** Read the repository state. A failure clears every figure rather than keeping one. */
  async read() {
    if (this.busy) return;
    this.busy = true;
    this.lastAttempt = new Date();
    this.paintControls();
    try {
      const returned = await this.call('audit', ['--json']);
      const payload = asObject(returned);
      if (!payload || typeof payload !== 'object') throw new Error('The audit command did not return a readable payload.');
      this.audit = payload;
      this.auditRaw = rawText(returned);
      this.lastError = null;
      this.state = Array.isArray(payload.errors) && payload.errors.length ? 'partial' : 'ok';
    } catch (err) {
      // No previous reading is retained: an unread repository is not a clean one.
      this.audit = null;
      this.auditRaw = '';
      this.lastError = err && err.message ? err.message : String(err);
      this.state = 'error';
    } finally {
      this.busy = false;
      this.paintHygiene();
      this.paintUpstream();
      this.paintProvenance();
      this.paintControls();
    }
  }

  async readDiff() {
    try {
      const returned = await this.call('diff', ['--json']);
      this.diff = asObject(returned);
      this.diffRaw = rawText(returned);
    } catch (err) {
      this.diff = null;
      this.diffRaw = err && err.message ? err.message : String(err);
    }
    this.paintChanges();
  }

  /* ----------------------------------------------------------------- events */

  show(id) {
    this.screen = id;
    this.shadowRoot.querySelectorAll('[data-screen]').forEach((el) => { el.hidden = el.dataset.screen !== id; });
    this.shadowRoot.querySelectorAll('[data-tab]').forEach((el) => el.setAttribute('aria-selected', el.dataset.tab === id ? 'true' : 'false'));
    if (id === 'changes' && !this.diff) void this.readDiff();
  }

  /* ---------------------------------------------------------------- verdict */

  /**
   * The verdict, computed only from returned values and in priority order.
   * The unknowable case is stated rather than implied to be clean.
   */
  verdict() {
    if (this.state === 'error') return { tone: 'danger', text: 'Cannot verify — the repository audit failed.' };
    const a = this.audit;
    if (!a) return { tone: 'neutral', text: 'Reading the repository\u2026' };

    const upstreamState = text(a, 'upstreamStatus');
    const errors = Array.isArray(a.errors) ? a.errors : [];
    if (upstreamState === 'error' || errors.length) {
      return { tone: 'warn', text: `Partially verified — ${errors.length ? errors.join(', ') : 'the upstream check failed'}.` };
    }

    const conflicts = count(a, 'conflictedFiles');
    if (conflicts) return { tone: 'danger', text: `${conflicts} conflict${conflicts === 1 ? '' : 's'} open — resolve before anything else.` };

    const unpushed = count(a, 'unpushedCommits');
    if (unpushed) return { tone: 'danger', text: `${unpushed} commit${unpushed === 1 ? '' : 's'} unpushed.` };

    if (upstreamState === 'gone') return { tone: 'danger', text: 'The upstream branch is gone — re-point it or push a new one.' };
    if (upstreamState === 'none' || upstreamState === 'detached' || upstreamState === 'unborn') {
      return { tone: 'warn', text: `Cannot tell whether work is pushed — ${UPSTREAM_STATES[upstreamState]?.label || upstreamState}.` };
    }
    if (upstreamState !== 'tracking') {
      return { tone: 'warn', text: 'Cannot tell whether work is pushed — the upstream could not be resolved.' };
    }

    const dirty = count(a, 'totalDirty');
    if (dirty) return { tone: 'warn', text: `Dirty worktree — ${dirty} file${dirty === 1 ? '' : 's'} not committed.` };

    const stashes = count(a, 'stashCount');
    if (stashes) return { tone: 'warn', text: `Clean and pushed, with ${stashes} stash${stashes === 1 ? '' : 'es'} parked.` };
    if (dirty === undefined) return { tone: 'neutral', text: 'Cannot confirm the worktree is clean.' };
    return { tone: 'ok', text: 'Safe to leave — everything is pushed and the worktree is clean.' };
  }

  /* ------------------------------------------------------------------ paint */

  paintHygiene() {
    const root = this.shadowRoot;
    if (!root) return;
    const a = this.audit;
    const v = this.verdict();

    const verdictEl = root.querySelector('#verdict');
    if (verdictEl) {
      verdictEl.textContent = v.text;
      verdictEl.dataset.tone = v.tone;
    }

    // Primary figure: unpushed commits. Unknowable is explained, never zeroed.
    const unpushed = count(a, 'unpushedCommits');
    const upstreamState = text(a, 'upstreamStatus');
    // The accent border lives on the figure wrapper, so the tone goes on both.
    const setTone = (figureId, numEl, tone) => {
      if (numEl) numEl.dataset.tone = tone;
      const wrap = root.querySelector(figureId);
      if (wrap) wrap.dataset.tone = tone;
    };

    const unpushedEl = root.querySelector('#unpushed');
    if (unpushedEl) unpushedEl.textContent = unpushed === undefined ? DASH : String(unpushed);
    setTone('#fig-unpushed', unpushedEl, unpushed === undefined ? 'neutral' : (unpushed > 0 ? 'danger' : 'ok'));
    const unpushedNote = root.querySelector('#unpushed-note');
    if (unpushedNote) {
      unpushedNote.textContent = unpushed === undefined
        ? `unknown \u00b7 ${UPSTREAM_STATES[upstreamState]?.label || 'no comparison available'}`
        : (unpushed > 0 ? 'not yet on the upstream' : 'nothing waiting to push');
    }

    const conflicts = count(a, 'conflictedFiles');
    const conflictsEl = root.querySelector('#conflicts');
    if (conflictsEl) conflictsEl.textContent = conflicts === undefined ? DASH : String(conflicts);
    setTone('#fig-conflicts', conflictsEl, conflicts === undefined ? 'neutral' : (conflicts > 0 ? 'danger' : 'ok'));
    const conflictsNote = root.querySelector('#conflicts-note');
    if (conflictsNote) conflictsNote.textContent = conflicts ? 'merge in progress' : (conflicts === 0 ? 'none open' : 'unknown');

    const dirty = count(a, 'totalDirty');
    const dirtyEl = root.querySelector('#dirty');
    if (dirtyEl) dirtyEl.textContent = dirty === undefined ? DASH : String(dirty);
    setTone('#fig-dirty', dirtyEl, dirty === undefined ? 'neutral' : (dirty > 0 ? 'warn' : 'ok'));
    const dirtyNote = root.querySelector('#dirty-note');
    if (dirtyNote) {
      if (dirty === undefined) dirtyNote.textContent = 'unknown';
      else {
        const parts = DIRTY_ROWS.map((r) => count(a, r.key) ?? 0);
        // Compact abbreviations: the full words wrap inside a figure tile, and
        // the four-way breakdown is already labelled in full below.
        dirtyNote.textContent = `${parts[0]} stg \u00b7 ${parts[1]} unstg \u00b7 ${parts[2]} untr \u00b7 ${parts[3]} conf`;
      }
    }

    const stashes = count(a, 'stashCount');
    const stashEl = root.querySelector('#stashes');
    if (stashEl) {
      stashEl.textContent = stashes === undefined ? DASH : String(stashes);
    }
    setTone('#fig-stashes', stashEl, stashes === undefined ? 'neutral' : (stashes > 0 ? 'warn' : 'ok'));
    const stashNote = root.querySelector('#stashes-note');
    if (stashNote) stashNote.textContent = stashes ? 'parked work' : (stashes === 0 ? 'nothing parked' : 'unknown');

    // The four-way breakdown, each row stating the action it implies.
    const rows = root.querySelector('#dirty-rows');
    if (rows) {
      rows.innerHTML = DIRTY_ROWS.map((r) => {
        const value = count(a, r.key);
        const tone = value === undefined ? 'neutral' : (value > 0 ? (r.key === 'conflictedFiles' ? 'danger' : 'warn') : 'neutral');
        return `<div class="dirty-row">
          <span class="dirty-label">${r.label}</span>
          <span class="dirty-count" data-tone="${tone}">${value === undefined ? DASH : value}</span>
          <span class="dirty-action">${escapeHtml(r.action)}</span>
        </div>`;
      }).join('');
    }

    const last = root.querySelector('#last-commit');
    if (last) last.textContent = text(a, 'lastCommit') || DASH;

    // Placement <-> Upstream screen: the branch is shown in the header too.
    const branchHead = root.querySelector('#up-branch-head');
    if (branchHead) {
      const branch = text(a, 'branch');
      const upstream = text(a, 'upstream');
      const info = UPSTREAM_STATES[upstreamState];
      branchHead.textContent = branch
        ? `${branch}${upstream ? ` \u2192 ${upstream}` : ''}${info ? ` \u00b7 ${info.label}` : ''}`
        : DASH;
    }

    const side = (selector, value) => { const el = root.querySelector(selector); if (el) el.textContent = value; };
    side('#up-branch-side', text(a, 'branch') || DASH);
    side('#up-name-side', text(a, 'upstream') || DASH);
    const aheadSide = count(a, 'unpushedCommits');
    const behindSide = count(a, 'behindCommits');
    side('#up-ahead-side', aheadSide === undefined ? DASH : String(aheadSide));
    side('#up-behind-side', behindSide === undefined ? DASH : String(behindSide));

    const errEl = root.querySelector('#errors');
    if (errEl) {
      const errors = a && Array.isArray(a.errors) ? a.errors : [];
      const failed = this.state === 'error';
      errEl.hidden = !failed && errors.length === 0;
      errEl.textContent = failed
        ? `${this.lastError || 'The audit failed.'} Last attempt ${this.lastAttempt ? this.lastAttempt.toLocaleTimeString() : DASH}.`
        : (errors.length ? `The command reported these failed checks: ${errors.join(', ')}. Figures below may be incomplete.` : '');
    }
  }

  paintChanges() {
    const root = this.shadowRoot;
    if (!root) return;
    const stat = root.querySelector('#diff-stat');
    const raw = root.querySelector('#diff-raw');
    const note = root.querySelector('#diff-note');
    const dirty = count(this.audit, 'unstagedFiles');
    if (note) {
      note.textContent = this.audit
        ? (dirty === undefined ? 'The unstaged count is unknown.'
          : dirty === 0 ? 'Nothing unstaged to show.' : `${dirty} unstaged file${dirty === 1 ? '' : 's'} changed.`)
        : 'Read the repository on the Hygiene screen first.';
    }
    const diffStat = this.diff && typeof this.diff.diffStat === 'string' ? this.diff.diffStat : '';
    if (stat) stat.textContent = diffStat || (this.diffRaw ? '' : 'No diffstat yet.');
    if (raw) raw.textContent = this.diffRaw || '';
  }

  paintUpstream() {
    const root = this.shadowRoot;
    if (!root) return;
    const a = this.audit;
    const state = text(a, 'upstreamStatus');
    const info = UPSTREAM_STATES[state];

    const set = (selector, value, tone) => {
      const el = root.querySelector(selector);
      if (!el) return;
      el.textContent = value;
      if (tone) el.dataset.tone = tone; else delete el.dataset.tone;
    };

    set('#up-branch', text(a, 'branch') || DASH);
    set('#up-head', text(a, 'headState') || DASH);
    set('#up-name', text(a, 'upstream') || DASH);
    set('#up-state', info ? info.label : (state || DASH), info ? (info.action ? 'danger' : 'neutral') : 'neutral');

    const ahead = count(a, 'unpushedCommits');
    const behind = count(a, 'behindCommits');
    set('#up-ahead', ahead === undefined ? DASH : String(ahead), ahead ? 'danger' : (ahead === 0 ? 'ok' : 'neutral'));
    set('#up-behind', behind === undefined ? DASH : String(behind));
    set('#up-last', text(a, 'lastCommit') || DASH);

    const note = root.querySelector('#up-note');
    if (note) {
      note.textContent = !a ? 'No reading yet.'
        : state === 'tracking' ? 'Ahead and behind are counted against the upstream branch.'
          : info?.action ? 'This state needs attention before the ahead and behind counts mean anything.'
            : 'This is a fact about the repository, not a failure.';
    }

    const errEl = root.querySelector('#up-errors');
    if (errEl) {
      const errors = a && Array.isArray(a.errors) ? a.errors : [];
      errEl.hidden = errors.length === 0;
      errEl.textContent = errors.length ? `Failed checks: ${errors.join(', ')}` : '';
    }
  }

  paintProvenance() {
    const root = this.shadowRoot;
    const out = root?.querySelector('#prov-audit');
    if (out) out.textContent = this.auditRaw || 'No audit reading yet.';
    const diff = root?.querySelector('#prov-diff');
    if (diff) diff.textContent = this.diffRaw || 'No diff reading yet.';
  }

  paintControls() {
    const root = this.shadowRoot;
    if (!root) return;
    const badge = root.querySelector('#read-state');
    if (badge) {
      const labels = { loading: 'Reading', ok: 'Verified', partial: 'Partial', error: 'Failed' };
      badge.textContent = labels[this.state] || 'Reading';
      badge.dataset.state = this.state;
    }
    const again = root.querySelector('#reread');
    if (again) again.disabled = this.busy;
  }

  /* ----------------------------------------------------------------- render */

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block; width: 100%; min-width: 0;
          --face-ok: #047857;
          --face-warn: #b45309;
          --face-danger: #b91c1c;
          --face-radius: 6px;
          --face-motion: 140ms ease-out;
          --face-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
          --face-text: var(--text-primary, #111827);
          --face-muted: var(--text-secondary, #6b7280);
          --face-line: var(--border, #e5e7eb);
          --face-surface: var(--bg-secondary, #f9fafb);
          --face-accent: var(--card-color, #b45309);
          font-family: 'Space Grotesk', var(--font-sans, system-ui, sans-serif);
          color: var(--face-text);
        }
        /* The light state colours are unreadable on a dark surface, including the
           verdict line, so they are retuned whenever the host is dark. */
        @media (prefers-color-scheme: dark) {
          :host {
            --face-ok: #34d399;
            --face-warn: #fbbf24;
            --face-danger: #f87171;
            --face-text: var(--text-primary, #e8eaf0);
            --face-muted: var(--text-secondary, #a2a8b8);
            --face-line: var(--border, #2a3040);
            --face-surface: var(--bg-secondary, #171a23);
          }
        }
        :host-context([data-theme="dark"]),
        :host-context(.theme-dark),
        :host-context(.dark) {
          --face-ok: #34d399;
          --face-warn: #fbbf24;
          --face-danger: #f87171;
          --face-text: var(--text-primary, #e8eaf0);
          --face-muted: var(--text-secondary, #a2a8b8);
          --face-line: var(--border, #2a3040);
          --face-surface: var(--bg-secondary, #171a23);
        }
        * { box-sizing: border-box; }
        .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
        .ident { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; min-width: 0; }
        .ident h2 { margin: 0; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; }
        .ident .where { font-family: var(--face-mono); font-size: 12px; color: var(--face-muted); overflow-wrap: anywhere; }
        #read-state { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--face-line); color: var(--face-muted); }
        #read-state[data-state="ok"] { color: var(--face-ok); border-color: color-mix(in srgb, var(--face-ok) 35%, transparent); }
        #read-state[data-state="partial"] { color: var(--face-warn); border-color: color-mix(in srgb, var(--face-warn) 35%, transparent); }
        #read-state[data-state="error"] { color: var(--face-danger); border-color: color-mix(in srgb, var(--face-danger) 35%, transparent); }
        .controls { display: flex; gap: 8px; flex-wrap: wrap; }
        button { min-height: 44px; padding: 8px 14px; font: inherit; font-size: 12px; font-weight: 600; border-radius: var(--face-radius); cursor: pointer; color: var(--face-text); background: transparent; border: 1px solid var(--face-line); transition: border-color var(--face-motion); }
        button:hover { border-color: var(--face-accent); }
        button:focus-visible { outline: 2px solid var(--face-accent); outline-offset: 1px; }
        button[disabled] { opacity: 0.5; cursor: not-allowed; }
        .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--face-line); margin-bottom: 14px; overflow-x: auto; }
        .tabs button { border: 0; border-bottom: 2px solid transparent; border-radius: 0; color: var(--face-muted); white-space: nowrap; }
        .tabs button[aria-selected="true"] { color: var(--face-text); border-bottom-color: var(--face-accent); }
        #verdict { font-size: 15px; font-weight: 700; margin: 0 0 16px; }
        #verdict[data-tone="ok"] { color: var(--face-ok); }
        #verdict[data-tone="warn"] { color: var(--face-warn); }
        #verdict[data-tone="danger"] { color: var(--face-danger); }
        #verdict[data-tone="neutral"] { color: var(--face-muted); }
        .figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); gap: 12px; }
        .figure { border: 1px solid var(--face-line); border-left: 3px solid var(--face-line); border-radius: var(--face-radius); padding: 12px; background: var(--face-surface); min-width: 0; }
        .figure[data-tone="ok"] { border-left-color: var(--face-ok); }
        .figure[data-tone="warn"] { border-left-color: var(--face-warn); }
        .figure[data-tone="danger"] { border-left-color: var(--face-danger); }
        .figure dt { font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--face-muted); margin: 0 0 6px; }
        .figure dd { margin: 0; }
        .figure .num { font-family: var(--face-mono); font-size: 38px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
        .num[data-tone="ok"] { color: var(--face-ok); }
        .num[data-tone="warn"] { color: var(--face-warn); }
        .num[data-tone="danger"] { color: var(--face-danger); }
        .num[data-tone="neutral"] { color: var(--face-muted); }
        .figure .note { font-size: 11px; color: var(--face-muted); margin-top: 6px; font-family: var(--face-mono); overflow-wrap: anywhere; line-height: 1.5; }
        .lower { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 16px; margin-top: 18px; }
        @media (max-width: 760px) { .lower { grid-template-columns: 1fr; } }
        h3 { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--face-muted); margin: 0 0 10px; }
        .dirty-row { display: grid; grid-template-columns: 92px 44px minmax(0, 1fr); align-items: baseline; gap: 10px; padding: 5px 0; border-bottom: 1px solid color-mix(in srgb, var(--face-line) 60%, transparent); }
        .dirty-row:last-child { border-bottom: 0; }
        .dirty-label { font-size: 12px; }
        .dirty-count { font-family: var(--face-mono); font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
        .dirty-count[data-tone="danger"] { color: var(--face-danger); }
        .dirty-count[data-tone="warn"] { color: var(--face-warn); }
        .dirty-action { font-size: 11px; color: var(--face-muted); }
        .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 12px; margin: 0; }
        /* Two columns read as a block; auto-fit strands the fourth item alone. */
        .facts-side { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .fact { border-top: 1px solid var(--face-line); padding-top: 8px; min-width: 0; }
        .fact dt { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--face-muted); margin: 0 0 3px; }
        .fact dd { margin: 0; font-family: var(--face-mono); font-size: 13px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
        .fact dd[data-tone="ok"] { color: var(--face-ok); }
        .fact dd[data-tone="danger"] { color: var(--face-danger); }
        .last-commit { margin-top: 18px; border-top: 1px solid var(--face-line); padding-top: 10px; }
        .last-commit p { margin: 0; font-family: var(--face-mono); font-size: 12px; color: var(--face-muted); overflow-wrap: anywhere; }
        pre { font-family: var(--face-mono); font-size: 11px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 320px; overflow: auto; margin: 6px 0 0; color: var(--face-muted); }
        .empty { font-size: 12px; color: var(--face-muted); margin: 0; }
        .error { font-size: 12px; color: var(--face-danger); margin: 0 0 14px; }
        .warn { font-size: 12px; color: var(--face-warn); margin: 0 0 14px; }
        .prose { font-size: 12px; color: var(--face-muted); line-height: 1.6; margin: 0 0 12px; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      </style>

      <div class="top">
        <div class="ident">
          <h2>Git Hygiene</h2>
          <span class="where" id="up-branch-head">${DASH}</span>
          <span id="read-state" data-state="loading">Reading</span>
        </div>
        <div class="controls"><button type="button" id="reread">Re-read</button></div>
      </div>

      <div class="tabs" role="tablist" aria-label="Repository screens">
        <button type="button" role="tab" data-tab="hygiene" aria-selected="true">Hygiene</button>
        <button type="button" role="tab" data-tab="changes" aria-selected="false">Changes</button>
        <button type="button" role="tab" data-tab="upstream" aria-selected="false">Upstream</button>
        <button type="button" role="tab" data-tab="provenance" aria-selected="false">Provenance</button>
      </div>

      <section data-screen="hygiene">
        <p class="error" id="errors" hidden></p>
        <p id="verdict" data-tone="neutral">Reading the repository\u2026</p>

        <dl class="figures">
          <div class="figure" id="fig-unpushed">
            <dt>Unpushed commits</dt>
            <dd><span class="num" id="unpushed" data-tone="neutral">${DASH}</span></dd>
            <dd class="note" id="unpushed-note">reading</dd>
          </div>
          <div class="figure" id="fig-conflicts">
            <dt>Conflicts</dt>
            <dd><span class="num" id="conflicts" data-tone="neutral">${DASH}</span></dd>
            <dd class="note" id="conflicts-note">reading</dd>
          </div>
          <div class="figure" id="fig-dirty">
            <dt>Dirty files</dt>
            <dd><span class="num" id="dirty" data-tone="neutral">${DASH}</span></dd>
            <dd class="note" id="dirty-note">reading</dd>
          </div>
          <div class="figure" id="fig-stashes">
            <dt>Stashes</dt>
            <dd><span class="num" id="stashes" data-tone="neutral">${DASH}</span></dd>
            <dd class="note" id="stashes-note">reading</dd>
          </div>
        </dl>

        <div class="lower">
          <div>
            <h3>Working tree, and what each category asks for</h3>
            <div id="dirty-rows"></div>
          </div>
          <div>
            <h3>Upstream</h3>
            <dl class="facts facts-side">
              <div class="fact"><dt>Branch</dt><dd id="up-branch-side">${DASH}</dd></div>
              <div class="fact"><dt>Upstream</dt><dd id="up-name-side">${DASH}</dd></div>
              <div class="fact"><dt>Ahead</dt><dd id="up-ahead-side">${DASH}</dd></div>
              <div class="fact"><dt>Behind</dt><dd id="up-behind-side">${DASH}</dd></div>
            </dl>
          </div>
        </div>

        <div class="last-commit">
          <h3>Last commit</h3>
          <p id="last-commit">${DASH}</p>
        </div>
      </section>

      <section data-screen="changes" hidden>
        <p class="prose" id="diff-note"></p>
        <h3>Diffstat of unstaged changes</h3>
        <pre id="diff-stat"></pre>
        <h3 style="margin-top:16px">Raw diff output</h3>
        <pre id="diff-raw"></pre>
      </section>

      <section data-screen="upstream" hidden>
        <p class="prose" id="up-note"></p>
        <dl class="facts">
          <div class="fact"><dt>Branch</dt><dd id="up-branch">${DASH}</dd></div>
          <div class="fact"><dt>HEAD state</dt><dd id="up-head">${DASH}</dd></div>
          <div class="fact"><dt>Upstream</dt><dd id="up-name">${DASH}</dd></div>
          <div class="fact"><dt>Upstream state</dt><dd id="up-state">${DASH}</dd></div>
          <div class="fact"><dt>Ahead</dt><dd id="up-ahead">${DASH}</dd></div>
          <div class="fact"><dt>Behind</dt><dd id="up-behind">${DASH}</dd></div>
        </dl>
        <div class="last-commit"><h3>Last commit</h3><p id="up-last">${DASH}</p></div>
        <p class="warn" id="up-errors" hidden></p>
      </section>

      <section data-screen="provenance" hidden>
        <p class="prose">Every figure on the other screens comes from these two commands. Nothing is inferred.</p>
        <h3>audit --json</h3>
        <pre id="prov-audit"></pre>
        <h3 style="margin-top:16px">diff --json</h3>
        <pre id="prov-diff"></pre>
      </section>
    `;

    const root = this.shadowRoot;
    root.querySelector('#reread')?.addEventListener('click', () => void this.read());
    root.querySelector('[aria-label="Repository screens"]')?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-tab]');
      if (button) this.show(button.dataset.tab);
    });

    this.show(this.screen);
    this.paintHygiene();
    this.paintChanges();
    this.paintUpstream();
    this.paintProvenance();
    this.paintControls();
  }
}

if (!customElements.get('tr-git-sentinel-card')) {
  customElements.define('tr-git-sentinel-card', GitSentinelCard);
}
