// Total Recall — Options Page Logic

(function () {
  'use strict';

  const brainUrlInput = document.getElementById('brain-url');
  const patInput = document.getElementById('pat-token');
  const btnTest = document.getElementById('btn-test');
  const connectionStatus = document.getElementById('connection-status');
  const blocklistTextarea = document.getElementById('blocklist');
  const btnSave = document.getElementById('btn-save');
  const saveStatus = document.getElementById('save-status');

  // ---- Load saved settings ----
  async function loadSettings() {
    const [localSettings, syncSettings] = await Promise.all([
      chrome.storage.local.get(['brainUrl', 'pat']),
      chrome.storage.sync.get([
      'blocklist',
      'captureGranularity',
      'passiveTracking'
      ])
    ]);
    const settings = { ...syncSettings, ...localSettings };

    const pre = self.PreConfigured || {};
    brainUrlInput.value = settings.brainUrl || pre.brainUrl || 'http://127.0.0.1:3000';
    patInput.value = settings.pat || pre.pat || '';

    // Blocklist: stored as array, displayed one per line
    if (Array.isArray(settings.blocklist)) {
      blocklistTextarea.value = settings.blocklist.join('\n');
    }

    // Granularity radio
    let granularity = settings.captureGranularity || 'minimal';
    if (settings.passiveTracking === false) {
      granularity = 'off';
    }
    const radio = document.querySelector(`input[name="granularity"][value="${granularity}"]`);
    if (radio) radio.checked = true;
  }

  // ---- Save settings ----
  btnSave.addEventListener('click', async () => {
    try {
      // Parse blocklist textarea into array
      const blocklistRaw = blocklistTextarea.value.trim();
      const blocklist = blocklistRaw
        ? blocklistRaw.split('\n').map((d) => d.trim()).filter(Boolean)
        : [];

      // Get selected granularity
      const granularityRadio = document.querySelector('input[name="granularity"]:checked');
      const captureGranularity = granularityRadio ? granularityRadio.value : 'minimal';
      const passiveTracking = captureGranularity !== 'off';

      await chrome.storage.local.set({
        brainUrl: brainUrlInput.value.trim() || 'http://127.0.0.1:3000',
        pat: patInput.value.trim(),
      });
      await chrome.storage.sync.remove('pat');
      await chrome.storage.sync.set({
        blocklist,
        captureGranularity,
        passiveTracking
      });

      showSaveStatus('Settings saved!', false);
    } catch (err) {
      showSaveStatus('Error: ' + err.message, true);
    }
  });

  // ---- Test connection ----
  btnTest.addEventListener('click', async () => {
    connectionStatus.textContent = 'Testing…';
    connectionStatus.className = 'connection-status';

    try {
      // Temporarily apply the input values for the test
      const testUrl = brainUrlInput.value.trim() || 'http://127.0.0.1:3000';
      const testPat = patInput.value.trim();

      const headers = { 'Content-Type': 'application/json' };
      if (testPat) headers['Authorization'] = `Bearer ${testPat}`;

      const res = await fetch(`${testUrl}/health`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      connectionStatus.textContent = '✓ Connected';
      connectionStatus.className = 'connection-status ok';
    } catch (err) {
      connectionStatus.textContent = `✗ ${err.message}`;
      connectionStatus.className = 'connection-status fail';
    }
  });

  // ---- Save status indicator ----
  function showSaveStatus(message, isError) {
    saveStatus.textContent = message;
    saveStatus.className = `save-status ${isError ? 'error' : 'saved'}`;
    setTimeout(() => {
      saveStatus.textContent = '';
      saveStatus.className = 'save-status';
    }, 3000);
  }

  // ---- Init ----
  loadSettings();
})();
