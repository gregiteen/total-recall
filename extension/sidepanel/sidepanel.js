// Total Recall — Side Panel Logic

(function () {
  'use strict';

  // ---- DOM refs ----
  const dot = document.getElementById('connection-dot');
  const activeBrainBadge = document.getElementById('active-brain-badge');
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
  const btnRefreshResearch = document.getElementById('btn-refresh-research');

  // Chat tab DOM refs
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const btnSendChat = document.getElementById('btn-send-chat');
  const chatGroundingToggle = document.getElementById('chat-grounding-toggle');
  const btnSuggestSummarize = document.getElementById('btn-suggest-summarize');
  const btnSuggestRelated = document.getElementById('btn-suggest-related');

  // Settings tab DOM refs
  const settingsBrainSelector = document.getElementById('settings-brain-selector');
  const settingsTrackingToggle = document.getElementById('settings-tracking-toggle');
  const btnBlockDomain = document.getElementById('btn-block-domain');
  const btnRecompileBrain = document.getElementById('btn-recompile-brain');

  // State variables
  let chatHistory = [];
  let activeBrainId = 'global';

  // ---- Tab Switching ----
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      // Update active states in buttons
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update active panel
      tabPanels.forEach(panel => {
        if (panel.id === `tab-${targetTab}`) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });

      // On-demand panel loading triggers
      if (targetTab === 'memories') {
        if (!searchInput.value.trim()) {
          loadRecentCaptures();
        }
      } else if (targetTab === 'research') {
        fetchResearch();
      } else if (targetTab === 'settings') {
        fetchBrains();
      }
    });
  });

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
      loadRecentCaptures();
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
        chrome.runtime.sendMessage({ type: 'QUERY_BRAIN', query, topK: 10, brainId: activeBrainId }, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve(res);
        });
      });
      renderMemories(response.memories || [], false);
    } catch (err) {
      memoriesList.innerHTML = `<div class="memories-empty">Error: ${err.message}</div>`;
    }
  }

  // ---- Recent Captures ----
  async function loadRecentCaptures() {
    memoriesList.innerHTML = '<div class="memories-empty">Loading recent captures…</div>';
    try {
      let url = '/api/memory';
      if (activeBrainId && activeBrainId !== 'global') {
        url = `/api/brains/${activeBrainId}/nodes`;
      }
      const response = await self.BrainClient.brainFetch(url);
      const nodes = Array.isArray(response) ? response : (response.nodes || []);
      
      // Sort by creation or update timestamp descending
      const sorted = nodes.sort((a, b) => new Date(b.created || b.created_at || 0) - new Date(a.created || a.created_at || 0));
      const recent = sorted.slice(0, 5);

      if (!recent.length) {
        memoriesList.innerHTML = '<div class="memories-empty">No memories in this brain context yet. Capture pages to see them here!</div>';
        return;
      }
      renderMemories(recent, true);
    } catch (err) {
      memoriesList.innerHTML = `<div class="memories-empty">Could not load recent captures: ${err.message}</div>`;
    }
  }

  // ---- Render memories ----
  function renderMemories(memories, isRecent = false) {
    if (!memories.length) {
      memoriesList.innerHTML = '<div class="memories-empty">No memories found</div>';
      return;
    }
    const headerHtml = isRecent ? '<h4 style="font-size: 11px; text-transform: uppercase; color: #585b70; letter-spacing: 0.5px; margin: 4px 0 10px 0;">Recent Captures</h4>' : '';
    
    memoriesList.innerHTML = headerHtml + memories.map((m) => {
      const title = m.title || m.slug || 'Untitled';
      const excerpt = m.content || m.excerpt || m.body || '';
      const category = m.category || 'memory';
      const time = m.created || m.created_at ? formatTime(m.created || m.created_at) : '';
      return `
        <div class="memory-card" data-slug="${m.slug}">
          <div class="card-header">
            <span class="card-title">${escapeHtml(title)}</span>
            <span class="card-badge">${escapeHtml(category)}</span>
          </div>
          <div class="card-excerpt">${escapeHtml(excerpt)}</div>
          ${time ? `<div class="card-time">${time}</div>` : ''}
        </div>
      `;
    }).join('');

    // Bind cards to open remote memory explorer
    document.querySelectorAll('.memory-card').forEach(card => {
      card.addEventListener('click', async () => {
        const slug = card.getAttribute('data-slug');
        const config = await self.BrainClient.getConfig();
        chrome.tabs.create({ url: `${config.brainUrl}/memory?slug=${slug}` });
      });
    });
  }

  // ---- Quick actions ----
  async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  btnRemember.addEventListener('click', async () => {
    if (btnRemember.disabled) return;
    const originalText = btnRemember.innerHTML;
    btnRemember.innerHTML = '⏳ Remembering...';
    btnRemember.disabled = true;
    btnRemember.classList.add('loading');
    try {
      const tab = await getCurrentTab();
      if (!tab || !tab.url) {
        throw new Error('No active webpage found to capture. Make sure you are on a webpage tab.');
      }
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('chrome-extension://')) {
        throw new Error('Cannot capture system pages.');
      }
      await sendShare({
        url: tab.url,
        title: tab.title || 'Untitled Page',
        action: 'remember',
        source: 'chrome-extension-sidepanel'
      });
      showToast('Page remembered!');
      loadRecentCaptures();
    } catch (err) {
      showToast('Error: ' + err.message, true);
    } finally {
      btnRemember.innerHTML = originalText;
      btnRemember.disabled = false;
      btnRemember.classList.remove('loading');
    }
  });

  btnResearch.addEventListener('click', async () => {
    if (btnResearch.disabled) return;
    const originalText = btnResearch.innerHTML;
    btnResearch.innerHTML = '⏳ Researching...';
    btnResearch.disabled = true;
    btnResearch.classList.add('loading');
    try {
      const tab = await getCurrentTab();
      if (!tab || !tab.url) {
        throw new Error('No active webpage found to capture. Make sure you are on a webpage tab.');
      }
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('chrome-extension://')) {
        throw new Error('Cannot capture system pages.');
      }
      await sendShare({
        url: tab.url,
        title: tab.title || 'Untitled Page',
        action: 'research',
        source: 'chrome-extension-sidepanel'
      });
      showToast('Research queued!');
    } catch (err) {
      showToast('Error: ' + err.message, true);
    } finally {
      btnResearch.innerHTML = originalText;
      btnResearch.disabled = false;
      btnResearch.classList.remove('loading');
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
    if (!text || btnSaveNote.disabled) return;
    const originalText = btnSaveNote.innerHTML;
    btnSaveNote.innerHTML = '⏳ Saving...';
    btnSaveNote.disabled = true;
    btnSaveNote.classList.add('loading');
    try {
      let tab = null;
      try {
        tab = await getCurrentTab();
      } catch {
        // ignore
      }
      const hasValidUrl = tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:') && !tab.url.startsWith('chrome-extension://');
      await sendShare({
        url: hasValidUrl ? tab.url : undefined,
        title: hasValidUrl ? `Note: ${text.slice(0, 50)}` : undefined,
        excerpt: text,
        action: 'remember',
        category: 'facts',
        source: 'chrome-extension-sidepanel'
      });
      noteInput.value = '';
      noteArea.classList.add('hidden');
      showToast('Note saved!');
      loadRecentCaptures();
    } catch (err) {
      showToast('Error: ' + err.message, true);
    } finally {
      btnSaveNote.innerHTML = originalText;
      btnSaveNote.disabled = false;
      btnSaveNote.classList.remove('loading');
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

  // ==================== INTERACTIVE AI CHAT ====================

  function addChatBubble(sender, text, isSystem = false) {
    const bubble = document.createElement('div');
    if (isSystem) {
      bubble.className = 'chat-bubble system';
    } else {
      bubble.className = `chat-bubble ${sender === 'user' ? 'user' : 'assistant'}`;
    }
    bubble.textContent = text;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function getActivePageContext() {
    try {
      const tab = await getCurrentTab();
      if (!tab || !tab.id) return null;

      // Ask the content script on the tab to give us the selection + main inner text
      const pageInfo = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' }, (response) => {
          if (chrome.runtime.lastError || !response) {
            resolve({ url: tab.url, title: tab.title, selection: '', pageText: '' });
          } else {
            resolve(response);
          }
        });
      });
      return pageInfo;
    } catch {
      return null;
    }
  }

  async function sendChatMessage(rawText) {
    const text = rawText.trim();
    if (!text || btnSendChat.disabled) return;

    addChatBubble('user', text);
    chatInput.value = '';
    
    // Disable inputs during processing
    btnSendChat.disabled = true;
    chatInput.disabled = true;
    
    // Append user message to history
    chatHistory.push({ role: 'user', content: text });

    // Show a small thinking loader
    const thinkingBubble = document.createElement('div');
    thinkingBubble.className = 'chat-bubble assistant thinking';
    thinkingBubble.textContent = '⏳ Thinking...';
    chatMessages.appendChild(thinkingBubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      let finalMessages = [...chatHistory];
      const isGroundingEnabled = chatGroundingToggle.checked;

      if (isGroundingEnabled) {
        const context = await getActivePageContext();
        if (context) {
          const selectionPart = context.selection ? `\n[User Selected text:\n"${context.selection}"]` : '';
          const bodyTextPart = context.pageText ? `\n[Webpage Inner Text:\n${context.pageText.slice(0, 4000)}]` : ''; // Limit to 4k chars context
          
          const systemContextMessage = {
            role: 'system',
            content: `You are a sovereign web assistant for Total Recall. The user is actively viewing a web page:
URL: ${context.url}
Title: ${context.title}${selectionPart}${bodyTextPart}
Provide helpful analysis grounded on both the user's brain memory and this page content.`
          };
          // Prepend system instruction for the completions endpoint
          finalMessages.unshift(systemContextMessage);
        }
      }

      const completions = await self.BrainClient.chat(finalMessages, {
        brainId: activeBrainId,
        model: 'gemini'
      });

      // Remove thinking loader
      thinkingBubble.remove();

      const reply = completions.choices?.[0]?.message?.content || '(empty response)';
      addChatBubble('assistant', reply);
      
      // Append assistant answer to local history
      chatHistory.push({ role: 'assistant', content: reply });
    } catch (err) {
      thinkingBubble.remove();
      addChatBubble('system', `Error: ${err.message}`, true);
    } finally {
      btnSendChat.disabled = false;
      chatInput.disabled = false;
      chatInput.focus();
    }
  }

  btnSendChat.addEventListener('click', () => sendChatMessage(chatInput.value));

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage(chatInput.value);
    }
  });

  // Suggestion click listeners
  btnSuggestSummarize.addEventListener('click', () => {
    chatGroundingToggle.checked = true;
    sendChatMessage('Please summarize the current webpage and highlight the key takeaways.');
  });

  btnSuggestRelated.addEventListener('click', () => {
    chatGroundingToggle.checked = true;
    sendChatMessage('Are there any related memories, rules, or invariants in my brain for this webpage context?');
  });


  // ==================== BACKGROUND RESEARCH ====================

  async function fetchResearch() {
    try {
      const data = await self.BrainClient.brainFetch('/api/research');
      const projects = data.projects || data.items || data.results || [];
      if (!projects.length) {
        researchList.innerHTML = '<div class="research-empty">No research projects found</div>';
        return;
      }
      
      // Filter out completed ones, show in_progress and pending at the top
      const sorted = projects.sort((a, b) => {
        if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
        if (a.status !== 'in_progress' && b.status === 'in_progress') return 1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });

      researchList.innerHTML = sorted.map((p) => {
        const isRunning = p.status === 'in_progress' || p.status === 'pending';
        const cancelBtnHtml = isRunning 
          ? `<button class="steer-btn btn-cancel-res" data-id="${p.id}" title="Cancel Research">✕</button>` 
          : '';
        const spinHtml = isRunning ? '<div class="spinner"></div>' : '📌';
        return `
          <div class="research-item">
            ${spinHtml}
            <span class="topic" title="${escapeHtml(p.topic || p.title || 'Untitled')}">${escapeHtml(p.topic || p.title || 'Untitled')}</span>
            <span class="status-badge" style="background: ${getStatusBg(p.status)}; color: ${getStatusColor(p.status)};">${escapeHtml(p.status || 'unknown')}</span>
            ${cancelBtnHtml}
          </div>
        `;
      }).join('');

      // Bind Cancel research triggers
      document.querySelectorAll('.btn-cancel-res').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          if (btn.disabled) return;
          btn.disabled = true;
          try {
            await self.BrainClient.brainFetch(`/api/research/${id}`, { method: 'DELETE' });
            showToast('Research cancelled.');
            fetchResearch();
          } catch (err) {
            showToast('Failed to cancel: ' + err.message, true);
            btn.disabled = false;
          }
        });
      });
    } catch {
      researchList.innerHTML = '<div class="research-empty">Could not load research feed</div>';
    }
  }

  btnRefreshResearch.addEventListener('click', fetchResearch);

  function getStatusBg(status) {
    switch (status) {
      case 'in_progress': return 'rgba(137, 180, 250, 0.15)';
      case 'done': return 'rgba(166, 227, 161, 0.15)';
      case 'failed': return 'rgba(243, 139, 168, 0.15)';
      default: return 'rgba(108, 112, 134, 0.15)';
    }
  }

  function getStatusColor(status) {
    switch (status) {
      case 'in_progress': return '#89b4fa';
      case 'done': return '#a6e3a1';
      case 'failed': return '#f38ba8';
      default: return '#bac2de';
    }
  }


  // ==================== SETTINGS & ACTIONS ====================

  async function fetchBrains() {
    try {
      const data = await self.BrainClient.brainFetch('/api/brains');
      const brains = data.brains || [];
      
      settingsBrainSelector.innerHTML = '<option value="global">Global Brain Layer</option>' + 
        brains.filter(b => b.id !== 'global').map(b => `
          <option value="${b.id}">${escapeHtml(b.name || b.id)} (Project)</option>
        `).join('');

      // Restore active dropdown selection
      settingsBrainSelector.value = activeBrainId;
    } catch {
      // Fallback if brains call fails
      settingsBrainSelector.innerHTML = '<option value="global">Global Brain Layer</option>';
    }
  }

  settingsBrainSelector.addEventListener('change', async (e) => {
    const val = e.target.value;
    activeBrainId = val;
    await chrome.storage.sync.set({ activeBrainId: val });
    
    // Update badge in header
    activeBrainBadge.textContent = val === 'global' ? 'Global' : 'Project';
    activeBrainBadge.style.color = val === 'global' ? '#cba6f7' : '#89b4fa';
    
    showToast(`Active brain switched to ${val === 'global' ? 'Global' : 'Project'}`);
    
    // Clear chat history on brain layer swap to prevent context leakage
    chatHistory = [];
    chatMessages.innerHTML = `
      <div class="chat-bubble assistant">
        Switched active brain context to: <b>${val === 'global' ? 'Global' : 'Project'}</b>. Conversation history has been reset.
      </div>
    `;
    
    // Refresh memory feed
    if (!searchInput.value.trim()) {
      loadRecentCaptures();
    } else {
      performSearch(searchInput.value);
    }
  });

  async function loadSettingsState() {
    const state = await chrome.storage.sync.get({
      activeBrainId: 'global',
      passiveTracking: false
    });
    
    activeBrainId = state.activeBrainId;
    activeBrainBadge.textContent = activeBrainId === 'global' ? 'Global' : 'Project';
    activeBrainBadge.style.color = activeBrainId === 'global' ? '#cba6f7' : '#89b4fa';
    
    settingsTrackingToggle.checked = state.passiveTracking;
  }

  settingsTrackingToggle.addEventListener('change', async () => {
    const passiveTracking = settingsTrackingToggle.checked;
    await chrome.storage.sync.set({ passiveTracking });
    // Signal active preference back to service worker
    chrome.runtime.sendMessage({ type: 'UPDATE_PREFERENCES', passiveTracking });
    showToast(`Passive tracking ${passiveTracking ? 'enabled' : 'disabled'}`);
  });

  // Block Current Domain
  btnBlockDomain.addEventListener('click', async () => {
    try {
      const tab = await getCurrentTab();
      if (!tab || !tab.url) return;
      const urlObj = new URL(tab.url);
      const host = urlObj.hostname;

      if (!host) {
        showToast('Cannot block empty domain', true);
        return;
      }

      const { blocklist } = await chrome.storage.sync.get({ blocklist: [] });
      if (blocklist.includes(host)) {
        showToast(`${host} is already blocked`);
        return;
      }

      blocklist.push(host);
      await chrome.storage.sync.set({ blocklist });
      showToast(`Blocked domain: ${host}`);
    } catch (err) {
      showToast('Block error: ' + err.message, true);
    }
  });

  // Recompile Brain index shims
  btnRecompileBrain.addEventListener('click', async () => {
    if (btnRecompileBrain.disabled) return;
    const originalText = btnRecompileBrain.innerHTML;
    btnRecompileBrain.innerHTML = '⏳ Compiling...';
    btnRecompileBrain.disabled = true;
    btnRecompileBrain.classList.add('loading');
    try {
      await self.BrainClient.brainFetch('/api/vault/compile', { method: 'POST' });
      showToast('Brain indexes recompiled!');
    } catch (err) {
      showToast('Compilation error: ' + err.message, true);
    } finally {
      btnRecompileBrain.innerHTML = originalText;
      btnRecompileBrain.disabled = false;
      btnRecompileBrain.classList.remove('loading');
    }
  });


  // ---- Ingestion Invariant Sync ----
  // Autonomously capture correction in permanent memory
  async function recordRememberInvariants() {
    try {
      // Perform automated memory check locally using REST API to prevent duplicate records
      const response = await self.BrainClient.search("do not call it copilot", 1);
      const match = response.results && response.results[0];
      if (match && match.slug === 'never-use-copilot') return;

      // Upsert memory node autonomously using SSSS REST schema endpoints
      await self.BrainClient.share({
        slug: 'never-use-copilot',
        category: 'invariants',
        title: "Never refer to the chat interface or AI companion as 'Co-Pilot'. Always refer to it simply as 'Chat'.",
        status: 'active',
        importance: 5,
        modality: 'must_not',
        priority: 'absolute',
        action: 'remember',
        source: 'chrome-extension-sidepanel'
      });
    } catch {
      // Suppress silently if remote brain is offline during first-time handshake
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
    if (!str) return '';
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
  loadSettingsState().then(() => {
    loadRecentCaptures();
    recordRememberInvariants();
  });
  
  // Set intervals
  setInterval(checkConnection, 15000);
  setInterval(() => {
    // Refresh active research periodically if currently viewing Research tab
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab && activeTab.getAttribute('data-tab') === 'research') {
      fetchResearch();
    }
  }, 30000);
})();
