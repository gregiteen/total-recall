const UPSTREAM = {
  tracking: 'Tracking local upstream',
  none: 'No upstream configured',
  gone: 'Upstream missing',
  detached: 'Detached HEAD',
  unborn: 'No commits yet',
  unknown: 'Upstream unknown',
  error: 'Upstream check failed'
};
const AUDIT_COUNTS = {
  unpushed: 'unpushedCommits', behind: 'behindCommits', conflicts: 'conflictedFiles',
  staged: 'stagedFiles', unstaged: 'unstagedFiles', untracked: 'untrackedFiles',
  dirty: 'totalDirty', stashes: 'stashCount'
};

function commandError(error) {
  try {
    const result = JSON.parse(error.message);
    if (typeof result.error === 'string') return result.error;
  } catch {}
  return error?.message || 'The owner command failed.';
}

class GitHome extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host {
          display:block; padding:var(--spacing-md,16px); color:var(--color-text,CanvasText);
          background:var(--color-background,Canvas); border:1px solid var(--color-border,currentColor);
          border-radius:var(--radius-md,6px); font:14px/1.55 var(--typography-body-font-family,system-ui,sans-serif);
        }
        * { box-sizing:border-box; min-width:0; }
        h2,h3,p,dl { margin:0; }
        h2 { font:600 clamp(1.55rem,5vw,2.1rem)/1.15 var(--typography-heading-font-family,Georgia,serif); }
        h3 { font-size:1.05rem; }
        .kicker { color:var(--color-accent,currentColor); letter-spacing:.1em; text-transform:uppercase; }
        section { margin-top:var(--spacing-md,16px); padding-top:12px; border-top:1px solid var(--color-border,currentColor); }
        .bar,.actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px 16px; }
        .bar { justify-content:space-between; }
        .metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,7rem),1fr)); gap:8px; margin:10px 0; }
        .metrics div { padding:8px; background:var(--color-surface,Canvas); border-radius:var(--radius-md,6px); }
        dd { margin:0; font:600 1.05rem var(--typography-mono-font-family,ui-monospace,monospace); font-variant-numeric:tabular-nums; }
        dt,.note { color:var(--color-muted,currentColor); }
        #conflicts[data-alert],#unpushed[data-alert],.error { color:var(--color-danger,currentColor); }
        #last-commit,#audit-time { overflow-wrap:anywhere; }
        #worktrees { padding:0; list-style:none; margin:8px 0; }
        #worktrees li {
          border-bottom:1px solid var(--color-border,currentColor); padding:8px 0;
          display:flex; flex-wrap:wrap; align-items:center; gap:8px; justify-content:space-between;
        }
        #worktrees code { display:block; overflow-wrap:anywhere; }
        button,input,select {
          min-height:44px; border:1px solid var(--color-border,currentColor); border-radius:var(--radius-md,6px);
          padding:6px 10px; font:inherit; color:inherit; background:var(--color-background,Canvas);
        }
        button { cursor:pointer; }
        button:disabled { opacity:.65; cursor:default; }
        button:focus-visible,input:focus-visible,select:focus-visible {
          outline:2px solid var(--color-accent,currentColor); outline-offset:3px;
        }
        label { display:grid; gap:4px; }
        .fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr)); gap:8px; margin:8px 0; }
        fieldset { margin:12px 0 0; padding:12px; background:var(--color-surface,Canvas); border:1px solid var(--color-border,currentColor); }
        #confirm-text { overflow-wrap:anywhere; margin-bottom:8px; }
        pre { overflow:auto; max-height:16rem; white-space:pre-wrap; overflow-wrap:anywhere; }
      </style>
      <header class="bar">
        <div><p class="kicker">Git Sentinel</p><h2>Repository ledger</h2></div>
        <button type="button" id="refresh">Refresh repository</button>
      </header>
      <section aria-labelledby="audit-heading">
        <h3 id="audit-heading">Working tree audit</h3>
        <p id="audit-state" role="status">Reading the repository…</p>
        <dl class="metrics">
          <div><dt>Unpushed</dt><dd id="unpushed">—</dd></div>
          <div><dt>Behind</dt><dd id="behind">—</dd></div>
          <div><dt>Conflicted</dt><dd id="conflicts">—</dd></div>
          <div><dt>Staged</dt><dd id="staged">—</dd></div>
          <div><dt>Unstaged</dt><dd id="unstaged">—</dd></div>
          <div><dt>Untracked</dt><dd id="untracked">—</dd></div>
          <div><dt>Dirty files</dt><dd id="dirty">—</dd></div>
          <div><dt>Stashes</dt><dd id="stashes">—</dd></div>
        </dl>
        <p id="upstream" class="note"></p>
        <p id="last-commit"></p>
        <p id="audit-time" class="note"></p>
      </section>
      <section aria-labelledby="worktree-heading">
        <h3 id="worktree-heading">Registered worktrees</h3>
        <p id="worktree-state" role="status">Reading worktree registrations…</p>
        <ul id="worktrees"></ul>
        <div id="create" hidden>
          <div class="fields">
            <label>New worktree path<input id="path" required></label>
            <label>Base ref<input id="base" placeholder="HEAD"></label>
          </div>
          <button type="button" id="plan-create">Review detached worktree</button>
        </div>
        <fieldset id="confirmation" hidden>
          <legend id="confirm-title"></legend>
          <p id="confirm-text"></p>
          <div class="actions">
            <button type="button" id="confirm"></button>
            <button type="button" id="cancel">Cancel</button>
          </div>
        </fieldset>
        <p id="action-status" role="status"></p>
      </section>
      <section id="changes" hidden aria-label="Diff statistics">
        <button type="button" id="show-diff" aria-expanded="false" aria-controls="diff">Inspect changed files</button>
        <div id="diff" hidden>
          <div class="fields">
            <label>Comparison<select id="diff-mode"><option value="working">Working tree</option><option value="staged">Staged changes</option></select></label>
            <label>Base ref<input id="diff-base" placeholder="Default comparison"></label>
          </div>
          <button type="button" id="read-diff">Read diff stats</button>
          <p id="diff-status" role="status"></p>
          <pre id="diff-stat"></pre>
        </div>
      </section>`;

    const field = id => root.getElementById(id);
    const set = (id, text) => { field(id).textContent = text; };
    const canRun = command => this.host?.operations?.includes(command);
    const run = async (command, args = []) => {
      if (!this.host?.run) throw new Error('The repository command runner is unavailable.');
      return this.host.run(command, args);
    };
    let busy = false;
    let pending;

    field('create').hidden = !canRun('worktree-create');
    field('changes').hidden = !canRun('diff');

    const setBusy = value => {
      busy = value;
      for (const control of root.querySelectorAll('#refresh, #plan-create, #worktrees button')) control.disabled = value;
    };

    const ask = (command, args, target, base = '') => {
      if (busy || !canRun(command)) return;
      const creating = command === 'worktree-create';
      pending = { command, args, trigger: root.activeElement };
      set('confirm-title', creating ? 'Create a detached worktree?' : 'Remove this linked worktree?');
      set('confirm-text', creating ? `${target} from ${base}` : `${target}. Git will refuse removal if it contains local changes.`);
      set('confirm', creating ? 'Confirm creation' : 'Confirm removal');
      field('confirmation').hidden = false;
      field('confirm').focus();
    };

    const paintAudit = report => {
      for (const [id, key] of Object.entries(AUDIT_COUNTS)) {
        const value = report?.[key];
        set(id, Number.isSafeInteger(value) ? String(value) : '—');
        field(id).toggleAttribute('data-alert', value > 0);
      }
      if (!report) {
        set('audit-state', 'Repository audit unavailable.');
        for (const id of ['upstream', 'last-commit', 'audit-time']) set(id, '');
        return;
      }
      const branch = report.branch || UPSTREAM[report.headState] || 'Branch unknown';
      const state = report.isClean === true ? 'Clean working tree' : report.isClean === false ? 'Changes in working tree' : 'Working tree state unknown';
      const incomplete = Array.isArray(report.errors) && report.errors.length ? ' Some audit checks failed.' : '';
      set('audit-state', `${branch} · ${state}.${incomplete}`);
      const upstream = UPSTREAM[report.upstreamStatus] || 'Upstream unknown';
      set('upstream', report.upstream ? `${upstream} ${report.upstream}.` : upstream);
      set('last-commit', report.lastCommit || 'Latest commit unavailable.');
      set('audit-time', report.timestamp ? `Observed ${report.timestamp}` : '');
    };

    const paintWorktrees = result => {
      field('worktrees').replaceChildren();
      if (!result) { set('worktree-state', 'Worktree inventory unavailable.'); return; }
      set('worktree-state', `${result.worktrees.length} registered.`);
      result.worktrees.forEach((tree, index) => {
        const row = document.createElement('li');
        const label = document.createElement('div');
        const name = document.createElement('strong');
        const path = document.createElement('code');
        const current = tree.path === result.current;
        const branch = tree.branch?.replace(/^refs\/heads\//, '') || (tree.detached ? 'Detached' : 'Branch unknown');
        const markers = [index === 0 && 'Main', current && 'Current', tree.locked && 'Locked', tree.prunable && 'Prunable'].filter(Boolean);
        name.textContent = [branch, ...markers, tree.head?.slice(0, 12)].filter(Boolean).join(' · ');
        path.textContent = tree.path;
        label.append(name, path);
        row.append(label);
        if (canRun('worktree-remove') && index > 0 && !current && !tree.locked && !tree.prunable) {
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.textContent = 'Review removal';
          remove.setAttribute('aria-label', `Review removal of ${tree.path}`);
          remove.addEventListener('click', () => ask('worktree-remove', ['--', tree.path], tree.path));
          row.append(remove);
        }
        field('worktrees').append(row);
      });
    };

    const refresh = async () => {
      if (busy) return;
      pending = undefined;
      field('confirmation').hidden = true;
      setBusy(true);
      set('audit-state', 'Reading the repository…');
      set('worktree-state', 'Reading worktree registrations…');
      try {
        await Promise.all([
          run('audit').then(result => paintAudit(typeof result?.headState === 'string' ? result : null), () => paintAudit(null)),
          run('worktree-list').then(result => paintWorktrees(result?.ok === true && Array.isArray(result.worktrees) ? result : null), () => paintWorktrees(null))
        ]);
      } finally { setBusy(false); }
    };

    field('refresh').addEventListener('click', () => void refresh());
    field('plan-create').addEventListener('click', () => {
      const target = field('path').value;
      if (!target.trim()) return;
      const base = field('base').value.trim() || 'HEAD';
      ask('worktree-create', ['--base', base, '--', target], target, base);
    });
    field('cancel').addEventListener('click', () => {
      const trigger = pending?.trigger;
      pending = undefined;
      field('confirmation').hidden = true;
      trigger?.focus();
    });
    field('confirm').addEventListener('click', async () => {
      if (busy || !pending || !canRun(pending.command)) return;
      const { command, args } = pending;
      pending = undefined;
      field('confirmation').hidden = true;
      setBusy(true);
      set('action-status', 'Running the confirmed worktree action…');
      try {
        const result = await run(command, args);
        if (result?.ok !== true) throw new Error('Git did not confirm the requested worktree change.');
        set('action-status', result.removed ? 'Linked worktree removed.' : 'Detached worktree created.');
        if (command === 'worktree-create') {
          field('path').value = '';
          field('base').value = '';
        }
      } catch (error) { set('action-status', commandError(error)); }
      finally { setBusy(false); await refresh(); field('refresh').focus(); }
    });
    field('show-diff').addEventListener('click', event => {
      field('diff').hidden = !field('diff').hidden;
      event.currentTarget.setAttribute('aria-expanded', String(!field('diff').hidden));
    });
    field('read-diff').addEventListener('click', async () => {
      if (!canRun('diff') || field('read-diff').disabled) return;
      const base = field('diff-base').value.trim();
      const args = [...(field('diff-mode').value === 'staged' ? ['--cached'] : []), ...(base ? ['--base', base] : [])];
      field('read-diff').disabled = true;
      set('diff-status', 'Reading diff stats…');
      set('diff-stat', '');
      try {
        const result = await run('diff', args);
        if (typeof result?.diffStat !== 'string') throw new Error('Diff statistics unavailable.');
        const outcome = result.diffStat ? 'Comparison complete.' : 'The selected comparison has no changes.';
        set('diff-status', result.timestamp ? `${outcome} Observed ${result.timestamp}.` : outcome);
        set('diff-stat', result.diffStat);
      } catch (error) { set('diff-status', commandError(error)); }
      finally { field('read-diff').disabled = false; }
    });
    void refresh();
  }
}

if (!customElements.get('tr-git-home')) customElements.define('tr-git-home', GitHome);
