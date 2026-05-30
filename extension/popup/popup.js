// Total Recall — Popup Logic

(function () {
  'use strict';

  const dot = document.getElementById('connection-dot');
  const urlInput = document.getElementById('url-input');
  const noteInput = document.getElementById('note-input');
  const btnRemember = document.getElementById('btn-remember');
  const btnResearch = document.getElementById('btn-research');
  const trackingToggle = document.getElementById('tracking-toggle');
  const statusMsg = document.getElementById('status-msg');

  // ---- Auto-fill current tab URL ----
  async function fillCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) urlInput.value = tab.url || '';
    } catch {
      // ignore — might not have activeTab permission yet
    }
  }

  // ---- Connection check ----
  async function checkConnection() {
    try {
      await self.BrainClient.healthCheck();
      dot.className = 'dot connected';
    } catch {
      dot.className = 'dot disconnected';
    }
  }

  // ---- Send share message to background ----
  function sendShare(data) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'SHARE', data }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (res && res.success) return resolve(res);
        reject(new Error(res?.error || 'Unknown error'));
      });
    });
  }

  // ---- Show status ----
  function showStatus(message, isError = false) {
    statusMsg.textContent = message;
    statusMsg.className = `status-msg ${isError ? 'error' : 'success'}`;
    statusMsg.classList.remove('hidden');
    setTimeout(() => statusMsg.classList.add('hidden'), 3000);
  }

  // ---- Remember ----
  btnRemember.addEventListener('click', async () => {
    if (btnRemember.disabled) return;
    const originalText = btnRemember.innerHTML;
    btnRemember.innerHTML = '⏳ Remembering...';
    btnRemember.disabled = true;
    btnRemember.classList.add('loading');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const payload = {
        url: tab?.url || urlInput.value,
        title: tab?.title || '',
        action: 'remember',
        source: 'chrome-extension-popup'
      };
      const note = noteInput.value.trim();
      if (note) payload.excerpt = note;
      await sendShare(payload);
      showStatus('Page remembered!');
      noteInput.value = '';
    } catch (err) {
      showStatus('Error: ' + err.message, true);
    } finally {
      btnRemember.innerHTML = originalText;
      btnRemember.disabled = false;
      btnRemember.classList.remove('loading');
    }
  });

  // ---- Research ----
  btnResearch.addEventListener('click', async () => {
    if (btnResearch.disabled) return;
    const originalText = btnResearch.innerHTML;
    btnResearch.innerHTML = '⏳ Researching...';
    btnResearch.disabled = true;
    btnResearch.classList.add('loading');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const payload = {
        url: tab?.url || urlInput.value,
        title: tab?.title || '',
        action: 'research',
        source: 'chrome-extension-popup'
      };
      const note = noteInput.value.trim();
      if (note) payload.excerpt = note;
      await sendShare(payload);
      showStatus('Research queued!');
      noteInput.value = '';
    } catch (err) {
      showStatus('Error: ' + err.message, true);
    } finally {
      btnResearch.innerHTML = originalText;
      btnResearch.disabled = false;
      btnResearch.classList.remove('loading');
    }
  });

  // ---- Tracking toggle ----
  async function loadTrackingPref() {
    const { passiveTracking } = await chrome.storage.sync.get('passiveTracking');
    trackingToggle.checked = passiveTracking || false;
  }

  trackingToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ passiveTracking: trackingToggle.checked });
  });

  // ---- Init ----
  fillCurrentTab();
  checkConnection();
  loadTrackingPref();
})();
