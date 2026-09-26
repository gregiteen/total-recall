// Total Recall — options page

(function () {
  'use strict';

  const Brain = self.BrainClient;
  const $ = (id) => document.getElementById(id);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setBusy(button, busy) {
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
  }

  function isLocal(url) {
    try {
      const host = new URL(url).hostname;
      return host === '127.0.0.1' || host === 'localhost';
    } catch {
      return false;
    }
  }

  function originPattern(url) {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/*`;
  }

  /** Remote brains need a runtime host grant; must be requested from a click. */
  async function ensureHostPermission(url) {
    if (isLocal(url)) return true;
    const origins = [originPattern(url)];
    if (await chrome.permissions.contains({ origins })) return true;
    return chrome.permissions.request({ origins });
  }

  function readConnectionForm() {
    const raw = $('brain-url').value.trim() || Brain.DEFAULT_BRAIN_URL;
    let brainUrl;
    try {
      const u = new URL(raw);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
      brainUrl = Brain.normalizeUrl(u.origin + u.pathname);
    } catch {
      throw new Error('Enter a full address, like http://127.0.0.1:3000');
    }
    return { brainUrl, pat: $('pat-token').value.trim() };
  }

  function setChip(text, tone) {
    const chip = $('connection-chip');
    chip.textContent = text;
    chip.className = `chip ${tone || ''}`;
  }

  function showResult(ok, rows, message) {
    const box = $('connection-result');
    box.className = `result ${ok ? 'ok' : 'fail'}`;
    if (ok) {
      box.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', '', k), el('dd', '', v)]));
    } else {
      box.replaceChildren(el('div', '', message));
    }
    box.hidden = false;
  }

  async function testConnection() {
    const { brainUrl, pat } = readConnectionForm();
    if (!(await ensureHostPermission(brainUrl))) {
      throw new Error(`Chrome permission to reach ${new URL(brainUrl).host} was declined.`);
    }
    const config = { brainUrl, pat, activeBrainId: 'global' };
    const health = await Brain.request('/health', { config, brainScoped: false });
    if (!pat) {
      const err = new Error('The brain is reachable. Add an access token to finish connecting.');
      err.code = 'unconfigured';
      err.health = health;
      throw err;
    }
    const list = await Brain.request('/api/memory?limit=1', { config });
    let brains = null;
    try { brains = await Brain.request('/api/brains', { config, brainScoped: false }); } catch { /* optional scope */ }
    return { health, total: list && list.total, brains: brains && brains.brains };
  }

  function describeTest(result) {
    const rows = [
      ['Brain', `v${result.health.version || '?'} · daemon ${result.health.daemon || 'unknown'}`],
      ['Memories', typeof result.total === 'number' ? result.total.toLocaleString() : '—'],
    ];
    if (Array.isArray(result.brains) && result.brains.length > 1) {
      rows.push(['Project brains', String(result.brains.length - 1)]);
    }
    return rows;
  }

  $('btn-test').addEventListener('click', async () => {
    const btn = $('btn-test');
    setBusy(btn, true);
    setChip('Testing…');
    try {
      const result = await testConnection();
      setChip('Connected', 'success');
      showResult(true, describeTest(result));
    } catch (err) {
      setChip(err.code === 'unconfigured' ? 'Needs token' : 'Not connected', err.code === 'unconfigured' ? 'warning' : 'error');
      showResult(false, null, err.message);
    } finally {
      setBusy(btn, false);
    }
  });

  $('btn-save-connection').addEventListener('click', async () => {
    const btn = $('btn-save-connection');
    setBusy(btn, true);
    try {
      const { brainUrl, pat } = readConnectionForm();
      if (!(await ensureHostPermission(brainUrl))) {
        throw new Error(`Without permission to reach ${new URL(brainUrl).host}, the extension can't use that brain.`);
      }
      await chrome.storage.local.set({ brainUrl, pat });
      await chrome.storage.sync.remove(['pat', 'brainUrl']);
      $('brain-url').value = brainUrl;
      try {
        const result = await testConnection();
        setChip('Connected', 'success');
        showResult(true, [['Saved', 'Connection works'], ...describeTest(result)]);
      } catch (err) {
        setChip('Saved · not connected', 'warning');
        showResult(false, null, `Saved, but the test failed: ${err.message}`);
      }
    } catch (err) {
      showResult(false, null, err.message);
    } finally {
      setBusy(btn, false);
    }
  });

  $('btn-reveal').addEventListener('click', () => {
    const input = $('pat-token');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    $('btn-reveal').setAttribute('aria-pressed', String(show));
    $('btn-reveal').setAttribute('aria-label', show ? 'Hide token' : 'Show token');
  });

  $('link-integrations').addEventListener('click', async (e) => {
    e.preventDefault();
    let base;
    try { base = readConnectionForm().brainUrl; } catch { base = Brain.DEFAULT_BRAIN_URL; }
    chrome.tabs.create({ url: `${base}/integrations` });
  });

  // ---- Privacy ----

  function syncPillSetting() {
    const on = $('opt-page-recall').checked;
    $('opt-show-pill').disabled = !on;
    $('pill-setting').classList.toggle('is-disabled', !on);
  }
  $('opt-page-recall').addEventListener('change', syncPillSetting);

  $('btn-save-privacy').addEventListener('click', async () => {
    const blocklist = $('blocklist').value
      .split('\n')
      .map((line) => line.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/\/.*$/, ''))
      .filter(Boolean);
    const unique = [...new Set(blocklist)];
    await chrome.storage.sync.set({
      pageRecall: $('opt-page-recall').checked,
      showPill: $('opt-show-pill').checked,
      blocklist: unique,
    });
    $('blocklist').value = unique.join('\n');
    const saved = $('privacy-saved');
    saved.hidden = false;
    setTimeout(() => { saved.hidden = true; }, 2200);
  });

  // ---- Shortcuts ----

  async function renderShortcuts() {
    const labels = {
      _execute_action: 'Open the side panel',
      'remember-page': 'Remember page (or selection)',
    };
    const commands = await chrome.commands.getAll();
    const list = $('shortcut-list');
    list.replaceChildren(...commands.filter((c) => labels[c.name]).map((c) => {
      const row = el('div');
      row.append(el('dt', '', labels[c.name]));
      const dd = el('dd');
      if (c.shortcut) {
        for (const key of c.shortcut.split(/\+/)) dd.append(el('span', 'kbd', key));
      } else {
        dd.append(el('span', 'unset', 'Not set'));
      }
      row.append(dd);
      return row;
    }));
  }

  $('btn-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

  // ---- Init ----

  async function init() {
    const [local, sync] = await Promise.all([
      chrome.storage.local.get(['brainUrl', 'pat']),
      chrome.storage.sync.get({ pageRecall: false, showPill: true, blocklist: [] }),
    ]);
    const config = await Brain.getConfig();
    $('brain-url').value = local.brainUrl || config.brainUrl;
    $('pat-token').value = config.pat || '';
    $('opt-page-recall').checked = !!sync.pageRecall;
    $('opt-show-pill').checked = sync.showPill !== false;
    $('blocklist').value = (sync.blocklist || []).join('\n');
    syncPillSetting();
    renderShortcuts();

    const foot = $('foot');
    foot.replaceChildren(el('span', '', `Total Recall extension v${chrome.runtime.getManifest().version}`), el('span', '', 'Your data stays on your brain.'));

    if (config.pat) $('btn-test').click();
  }

  init();
})();
