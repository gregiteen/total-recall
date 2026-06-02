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

  // ==================== COLLABORATION MODULE ====================
  const collabAuthView = document.getElementById('collab-auth-view');
  const collabMainView = document.getElementById('collab-main-view');
  const collabUsernameInput = document.getElementById('collab-username');
  const collabPasswordInput = document.getElementById('collab-password');
  const btnCollabLogin = document.getElementById('btn-collab-login');
  const btnCollabRegister = document.getElementById('btn-collab-register');

  const collabUserDisplay = document.getElementById('collab-user-display');
  const btnCollabLogout = document.getElementById('btn-collab-logout');
  const collabGroupSelect = document.getElementById('collab-group-select');

  const btnCollabShowJoin = document.getElementById('btn-collab-show-join');
  const btnCollabShowCreate = document.getElementById('btn-collab-show-create');
  const collabJoinGroupRow = document.getElementById('collab-join-group-row');
  const collabJoinCode = document.getElementById('collab-join-code');
  const btnCollabSubmitJoin = document.getElementById('btn-collab-submit-join');

  const collabCreateGroupRow = document.getElementById('collab-create-group-row');
  const collabCreateName = document.getElementById('collab-create-name');
  const btnCollabSubmitCreate = document.getElementById('btn-collab-submit-create');

  const collabAnnotationsList = document.getElementById('collab-annotations-list');
  const collabNoteInput = document.getElementById('collab-note-input');
  const btnCollabSaveNote = document.getElementById('btn-collab-save-note');

  const collabPresenceCount = document.getElementById('collab-presence-count');
  const collabChatMessages = document.getElementById('collab-chat-messages');
  const collabChatInput = document.getElementById('collab-chat-input');
  const btnCollabSendChat = document.getElementById('btn-collab-send-chat');

  let collabToken = '';
  let collabUsername = '';
  let collabActiveUrl = '';
  let collabSocket = null;
  let collabGroups = [];
  let collabSelectedGroup = null;

  async function initCollab() {
    const data = await chrome.storage.local.get(['collabToken', 'collabUsername']);
    if (data.collabToken && data.collabUsername) {
      collabToken = data.collabToken;
      collabUsername = data.collabUsername;
      showCollabMain();
    } else {
      showCollabAuth();
    }
  }

  function showCollabAuth() {
    collabAuthView.classList.remove('hidden');
    collabMainView.classList.add('hidden');
    closeCollabSocket();
  }

  async function showCollabMain() {
    collabAuthView.classList.add('hidden');
    collabMainView.classList.remove('hidden');
    collabUserDisplay.textContent = collabUsername;
    await fetchCollabGroups();
    updateCollabActiveUrl();
  }

  async function fetchCollabGroups() {
    try {
      const config = await self.BrainClient.getConfig();
      const res = await fetch(`${config.brainUrl}/api/collab/groups`, {
        headers: { 'Authorization': `Bearer ${collabToken}` }
      });
      if (res.ok) {
        collabGroups = await res.json();
        renderCollabGroupsDropdown();
      } else if (res.status === 401) {
        logoutCollab();
      }
    } catch (err) {
      console.error('Failed to fetch collab groups:', err);
    }
  }

  function renderCollabGroupsDropdown() {
    collabGroupSelect.innerHTML = collabGroups.map(g => 
      `<option value="${g.code}">${escapeHtml(g.name)} (${g.code})</option>`
    ).join('');
    if (collabGroups.length > 0) {
      const activeCode = collabGroupSelect.value;
      collabSelectedGroup = collabGroups.find(g => g.code === activeCode) || collabGroups[0];
    } else {
      collabSelectedGroup = null;
    }
  }

  async function updateCollabActiveUrl() {
    try {
      const tab = await getCurrentTab();
      if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:') && !tab.url.startsWith('chrome-extension://')) {
        const cleanUrl = tab.url.split('#')[0];
        if (cleanUrl !== collabActiveUrl) {
          collabActiveUrl = cleanUrl;
          if (collabToken) {
            await fetchCollabAnnotations();
            connectCollabSocket();
          }
        }
      } else {
        collabActiveUrl = '';
        collabAnnotationsList.innerHTML = '<div class="memories-empty">No active web tab</div>';
        closeCollabSocket();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchCollabAnnotations() {
    if (!collabActiveUrl || !collabToken) return;
    try {
      const config = await self.BrainClient.getConfig();
      const res = await fetch(`${config.brainUrl}/api/collab/annotations?url=${encodeURIComponent(collabActiveUrl)}`, {
        headers: { 'Authorization': `Bearer ${collabToken}` }
      });
      if (res.ok) {
        const annotations = await res.json();
        renderCollabAnnotations(annotations);
      }
    } catch (err) {
      console.error('Failed to fetch annotations:', err);
    }
  }

  function renderCollabAnnotations(list) {
    if (!list.length) {
      collabAnnotationsList.innerHTML = '<div class="memories-empty">No notes on this page</div>';
      return;
    }
    collabAnnotationsList.innerHTML = list.map(a => `
      <div class="collab-annotation-item">
        <div class="author">👤 ${escapeHtml(a.author)}</div>
        ${a.excerpt ? `<div class="excerpt">${escapeHtml(a.excerpt)}</div>` : ''}
        <div class="text">${escapeHtml(a.text)}</div>
        <div class="time">${formatTime(a.created_at)}</div>
      </div>
    `).join('');
  }

  function connectCollabSocket() {
    if (!collabToken || !collabActiveUrl) return;
    closeCollabSocket();

    self.BrainClient.getConfig().then(config => {
      const serverUrl = new URL(config.brainUrl);
      const wsProto = serverUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${serverUrl.host}/collab-ws?token=${collabToken}`;
      
      const ws = new WebSocket(wsUrl);
      collabSocket = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'SUBSCRIBE', url: collabActiveUrl }));
        collabPresenceCount.textContent = 'Connected';
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'CHAT_MESSAGE') {
            appendCollabChatBubble(data.username, data.text, data.created_at);
          } else if (data.type === 'USER_JOINED') {
            appendCollabChatBubble('System', `${data.username} joined this page`, new Date().toISOString(), true);
          } else if (data.type === 'USER_LEFT') {
            appendCollabChatBubble('System', `${data.username} left`, new Date().toISOString(), true);
          } else if (data.type === 'ANNOTATION_ADDED') {
            fetchCollabAnnotations();
          }
        } catch (err) {
          console.error(err);
        }
      };

      ws.onclose = () => {
        collabPresenceCount.textContent = 'Disconnected';
      };

      ws.onerror = () => {
        collabPresenceCount.textContent = 'Error';
      };
    });
  }

  function closeCollabSocket() {
    if (collabSocket) {
      try {
        collabSocket.close();
      } catch {}
      collabSocket = null;
    }
  }

  function appendCollabChatBubble(sender, text, timestamp, isSystem = false) {
    const bubble = document.createElement('div');
    if (isSystem) {
      bubble.className = 'chat-bubble system';
      bubble.textContent = text;
    } else {
      const isMe = sender.toLowerCase() === collabUsername.toLowerCase();
      bubble.className = `chat-bubble ${isMe ? 'user' : 'assistant'}`;
      bubble.innerHTML = `<span style="font-size: 10px; opacity: 0.8; font-weight: bold; display: block; margin-bottom: 2px;">${escapeHtml(sender)}</span>${escapeHtml(text)}`;
    }
    collabChatMessages.appendChild(bubble);
    collabChatMessages.scrollTop = collabChatMessages.scrollHeight;
  }

  async function registerCollab(username, password) {
    try {
      const config = await self.BrainClient.getConfig();
      const res = await fetch(`${config.brainUrl}/api/collab/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        collabToken = data.token;
        collabUsername = data.username;
        await chrome.storage.local.set({ collabToken: data.token, collabUsername: data.username });
        showToast('Registered successfully!');
        showCollabMain();
      } else {
        showToast('Registration failed: ' + (data.error || 'Unknown error'), true);
      }
    } catch (err) {
      showToast('Registration error: ' + err.message, true);
    }
  }

  async function loginCollab(username, password) {
    try {
      const config = await self.BrainClient.getConfig();
      const res = await fetch(`${config.brainUrl}/api/collab/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        collabToken = data.token;
        collabUsername = data.username;
        await chrome.storage.local.set({ collabToken: data.token, collabUsername: data.username });
        showToast('Logged in successfully!');
        showCollabMain();
      } else {
        showToast('Login failed: ' + (data.error || 'Unknown error'), true);
      }
    } catch (err) {
      showToast('Login error: ' + err.message, true);
    }
  }

  async function logoutCollab() {
    collabToken = '';
    collabUsername = '';
    await chrome.storage.local.remove(['collabToken', 'collabUsername']);
    showCollabAuth();
    showToast('Logged out');
  }

  // --- Buttons / Forms bindings ---
  btnCollabLogin.addEventListener('click', () => {
    const u = collabUsernameInput.value.trim();
    const p = collabPasswordInput.value.trim();
    if (u && p) loginCollab(u, p);
  });

  btnCollabRegister.addEventListener('click', () => {
    const u = collabUsernameInput.value.trim();
    const p = collabPasswordInput.value.trim();
    if (u && p) registerCollab(u, p);
  });

  btnCollabLogout.addEventListener('click', logoutCollab);

  btnCollabShowJoin.addEventListener('click', () => {
    collabJoinGroupRow.classList.toggle('hidden');
    collabCreateGroupRow.classList.add('hidden');
  });

  btnCollabShowCreate.addEventListener('click', () => {
    collabCreateGroupRow.classList.toggle('hidden');
    collabJoinGroupRow.classList.add('hidden');
  });

  btnCollabSubmitJoin.addEventListener('click', async () => {
    const code = collabJoinCode.value.trim();
    if (!code) return;
    try {
      const config = await self.BrainClient.getConfig();
      const res = await fetch(`${config.brainUrl}/api/collab/groups/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${collabToken}`
        },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Joined group!');
        collabJoinCode.value = '';
        collabJoinGroupRow.classList.add('hidden');
        await fetchCollabGroups();
      } else {
        showToast('Join error: ' + data.error, true);
      }
    } catch (err) {
      showToast('Failed to join: ' + err.message, true);
    }
  });

  btnCollabSubmitCreate.addEventListener('click', async () => {
    const name = collabCreateName.value.trim();
    if (!name) return;
    try {
      const config = await self.BrainClient.getConfig();
      const res = await fetch(`${config.brainUrl}/api/collab/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${collabToken}`
        },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Group created!');
        collabCreateName.value = '';
        collabCreateGroupRow.classList.add('hidden');
        await fetchCollabGroups();
      } else {
        showToast('Create error: ' + data.error, true);
      }
    } catch (err) {
      showToast('Failed to create group: ' + err.message, true);
    }
  });

  collabGroupSelect.addEventListener('change', () => {
    const activeCode = collabGroupSelect.value;
    collabSelectedGroup = collabGroups.find(g => g.code === activeCode) || null;
    fetchCollabAnnotations();
  });

  btnCollabSaveNote.addEventListener('click', async () => {
    const text = collabNoteInput.value.trim();
    if (!text || !collabActiveUrl || !collabSelectedGroup) return;
    try {
      const config = await self.BrainClient.getConfig();
      const res = await fetch(`${config.brainUrl}/api/collab/annotations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${collabToken}`
        },
        body: JSON.stringify({
          url: collabActiveUrl,
          groupCode: collabSelectedGroup.code,
          text
        })
      });
      if (res.ok) {
        showToast('Note pinned!');
        collabNoteInput.value = '';
        fetchCollabAnnotations();
      } else {
        const errData = await res.json();
        showToast('Pin note error: ' + errData.error, true);
      }
    } catch (err) {
      showToast('Failed to pin note: ' + err.message, true);
    }
  });

  btnCollabSendChat.addEventListener('click', () => {
    const text = collabChatInput.value.trim();
    if (text && collabSocket && collabSocket.readyState === WebSocket.OPEN) {
      collabSocket.send(JSON.stringify({ type: 'CHAT_MESSAGE', text }));
      collabChatInput.value = '';
    }
  });

  collabChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      btnCollabSendChat.click();
    }
  });

  // Listen for tab active changes
  chrome.tabs.onActivated.addListener(() => {
    updateCollabActiveUrl();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      updateCollabActiveUrl();
    }
  });

  // ---- Event listeners ----
  searchInput.addEventListener('input', (e) => debounceSearch(e.target.value));

  // ---- Init ----
  checkConnection();
  loadSettingsState().then(() => {
    loadRecentCaptures();
    recordRememberInvariants();
    initCollab();
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


