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

      // Check for extension updates
      try {
        const status = await self.BrainClient.brainFetch('/api/extension/status');
        const clientVersion = chrome.runtime.getManifest().version;
        if (status && status.version && status.version !== clientVersion) {
          const config = await self.BrainClient.getConfig();
          const brainUrl = config.brainUrl || 'http://127.0.0.1:3000';
          const footer = document.querySelector('.popup-footer');
          if (footer) {
            footer.innerHTML = `
              <span style="color: #f38ba8; font-weight: bold; display: flex; align-items: center; gap: 4px;">⚠️ Update Available (v${status.version})</span>
              <a href="${brainUrl}/health" target="_blank" style="color: #89b4fa; text-decoration: none; font-weight: bold;">Download ZIP</a>
            `;
          }
        }
      } catch (err) {
        console.error('Failed to check extension update status:', err);
      }
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
      const note = noteInput.value.trim();
      const targetUrl = tab?.url || urlInput.value || '';
      
      // If we don't have a URL, we must have a note/excerpt
      if (!targetUrl && !note) {
        throw new Error('Please enter a note or browse to a webpage to remember.');
      }
      if (targetUrl && (targetUrl.startsWith('chrome://') || targetUrl.startsWith('about:') || targetUrl.startsWith('chrome-extension://'))) {
        if (!note) {
          throw new Error('Cannot capture system pages. Please enter a note to save.');
        }
      }

      const payload = {
        url: targetUrl && !targetUrl.startsWith('chrome://') && !targetUrl.startsWith('about:') && !targetUrl.startsWith('chrome-extension://') ? targetUrl : undefined,
        title: tab?.title || '',
        action: 'remember',
        source: 'chrome-extension-popup'
      };
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
      const note = noteInput.value.trim();
      const targetUrl = tab?.url || urlInput.value || '';

      if (!targetUrl && !note) {
        throw new Error('Please enter research notes or browse to a webpage to queue research.');
      }
      if (targetUrl && (targetUrl.startsWith('chrome://') || targetUrl.startsWith('about:') || targetUrl.startsWith('chrome-extension://'))) {
        if (!note) {
          throw new Error('Cannot research system pages. Please enter research notes.');
        }
      }

      const payload = {
        url: targetUrl && !targetUrl.startsWith('chrome://') && !targetUrl.startsWith('about:') && !targetUrl.startsWith('chrome-extension://') ? targetUrl : undefined,
        title: tab?.title || '',
        action: 'research',
        source: 'chrome-extension-popup'
      };
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

  // Populate version label
  const versionLabel = document.getElementById('version-label');
  if (versionLabel) {
    versionLabel.textContent = 'v' + chrome.runtime.getManifest().version;
  }
})();
