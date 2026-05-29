// Total Recall — Side Panel Logic

(function () {
  'use strict';

  // ---- DOM refs ----
  const dot = document.getElementById('connection-dot');
  const searchInput = document.getElementById('search-input');
  const memoriesList = document.getElementById('memories-list');
  const btnRemember = document.getElementById('btn-remember');
  const btnResearch = document.getElementById('btn-research');
  const btnNote = document.getElementById('btn-note');
  const noteArea = document.getElementById('note-area');
  const noteInput = document.getElementById('note-input');
  const btnSaveNote = document.getElementById('btn-save-note');
  const btnCancelNote = document.getElementById('btn-cancel-note');
  const researchList = document.getElementById('research-list');

  // ---- Connection check ----
  async function checkConnection() {
    try {
      await self.BrainClient.healthCheck();
      dot.className = 'dot connected';
    } catch {
      dot.className = 'dot disconnected';
    }
  }

  // ---- Debounced search ----
  let searchTimer = null;

  function debounceSearch(query) {
    clearTimeout(searchTimer);
    if (!query.trim()) {
      memoriesList.innerHTML = '<div class="memories-empty">Search your brain for related memories</div>';
      return;
    }
    searchTimer = setTimeout(() => {
      performSearch(query.trim());
    }, 300);
  }

  async function performSearch(query) {
    memoriesList.innerHTML = '<div class="memories-empty">Searching…</div>';
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'QUERY_BRAIN', query, topK: 10 }, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve(res);
        });
      });
      renderMemories(response.memories || []);
    } catch (err) {
      memoriesList.innerHTML = `<div class="memories-empty">Error: ${err.message}</div>`;
    }
  }

  // ---- Render memories ----
  function renderMemories(memories) {
    if (!memories.length) {
      memoriesList.innerHTML = '<div class="memories-empty">No memories found</div>';
      return;
    }
    memoriesList.innerHTML = memories.map((m) => {
      const title = m.title || m.slug || 'Untitled';
      const excerpt = m.content || m.excerpt || '';
      const category = m.category || 'memory';
      const time = m.created_at ? formatTime(m.created_at) : '';
      return `
        <div class="memory-card">
          <div class="card-header">
            <span class="card-title">${escapeHtml(title)}</span>
            <span class="card-badge">${escapeHtml(category)}</span>
          </div>
          <div class="card-excerpt">${escapeHtml(excerpt)}</div>
          ${time ? `<div class="card-time">${time}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  // ---- Quick actions ----
  async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  btnRemember.addEventListener('click', async () => {
    try {
      const tab = await getCurrentTab();
      await sendShare({
        url: tab.url,
        title: tab.title,
        action: 'remember',
        source: 'chrome-extension-sidepanel'
      });
      showToast('Page remembered!');
    } catch (err) {
      showToast('Error: ' + err.message, true);
    }
  });

  btnResearch.addEventListener('click', async () => {
    try {
      const tab = await getCurrentTab();
      await sendShare({
        url: tab.url,
        title: tab.title,
        action: 'research',
        source: 'chrome-extension-sidepanel'
      });
      showToast('Research queued!');
    } catch (err) {
      showToast('Error: ' + err.message, true);
    }
  });

  // ---- Quick Note ----
  btnNote.addEventListener('click', () => {
    noteArea.classList.toggle('hidden');
    if (!noteArea.classList.contains('hidden')) {
      noteInput.focus();
    }
  });

  btnCancelNote.addEventListener('click', () => {
    noteArea.classList.add('hidden');
    noteInput.value = '';
  });

  btnSaveNote.addEventListener('click', async () => {
    const text = noteInput.value.trim();
    if (!text) return;
    try {
      const tab = await getCurrentTab();
      await sendShare({
        url: tab.url,
        title: `Note: ${text.slice(0, 50)}`,
        excerpt: text,
        action: 'remember',
        category: 'fact',
        source: 'chrome-extension-sidepanel'
      });
      noteInput.value = '';
      noteArea.classList.add('hidden');
      showToast('Note saved!');
    } catch (err) {
      showToast('Error: ' + err.message, true);
    }
  });

  // ---- Share helper ----
  function sendShare(data) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'SHARE', data }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (res && res.success) return resolve(res);
        reject(new Error(res?.error || 'Unknown error'));
      });
    });
  }

  // ---- Research feed ----
  async function fetchResearch() {
    try {
      const data = await self.BrainClient.brainFetch('/api/research?status=in_progress');
      const projects = data.projects || data.results || [];
      if (!projects.length) {
        researchList.innerHTML = '<div class="research-empty">No active research</div>';
        return;
      }
      researchList.innerHTML = projects.map((p) => `
        <div class="research-item">
          <div class="spinner"></div>
          <span class="topic">${escapeHtml(p.topic || p.title || 'Untitled')}</span>
          <span class="status-badge">${escapeHtml(p.status || 'running')}</span>
        </div>
      `).join('');
    } catch {
      researchList.innerHTML = '<div class="research-empty">Could not load research</div>';
    }
  }

  // ---- Toast ----
  function showToast(message, isError = false) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    // Force reflow to restart animation
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // ---- Helpers ----
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatTime(dateStr) {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diff = now - d;
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return d.toLocaleDateString();
    } catch {
      return '';
    }
  }

  // ---- Event listeners ----
  searchInput.addEventListener('input', (e) => debounceSearch(e.target.value));

  // ---- Init ----
  checkConnection();
  fetchResearch();
  setInterval(fetchResearch, 30000);
})();
