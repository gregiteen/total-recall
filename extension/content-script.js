// Total Recall — Content Script
// Injected into every page. Queries the brain for related memories and shows
// a floating pill in the bottom-right corner when matches are found.
// Clicking the pill opens an interactive overlay listing the related memories
// and exposing quick actions (Remember page, Research page).
// Uses Shadow DOM to isolate styles from the host page.

(function () {
  'use strict';

  // ---- Capture page context ----
  const pageContext = {
    url: location.href,
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content || ''
  };

  // ---- Skip non-content pages ----
  if (pageContext.url.startsWith('chrome://') ||
      pageContext.url.startsWith('chrome-extension://') ||
      pageContext.url.startsWith('about:')) {
    return;
  }

  let pillHost = null;
  let currentMemories = [];

  // ---- Create floating pill and interactive overlay with Shadow DOM ----
  function createPill(count) {
    if (pillHost) pillHost.remove();

    pillHost = document.createElement('div');
    pillHost.id = 'total-recall-pill-host';

    const shadow = pillHost.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .container {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
      }

      .pill {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        background: #11111b;
        color: #cdd6f4;
        border: 1px solid #313244;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;
        opacity: 0;
        transform: translateY(10px);
        animation: pill-enter 0.3s ease forwards;
      }

      .pill:hover {
        border-color: #89b4fa;
        transform: translateY(-2px);
        box-shadow: 0 6px 24px rgba(137, 180, 250, 0.2);
        background: #1e1e2e;
      }

      .pill.active {
        border-color: #89b4fa;
        background: #1e1e2e;
      }

      .pill .brain-icon {
        font-size: 15px;
        line-height: 1;
      }

      .pill .count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        background: #89b4fa;
        color: #11111b;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
      }

      /* Interactive Overlay Card */
      .card {
        display: none;
        flex-direction: column;
        width: 320px;
        max-height: 420px;
        background: rgba(17, 17, 27, 0.95);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid #313244;
        border-radius: 16px;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
        position: absolute;
        bottom: 50px;
        right: 0;
        z-index: 2147483647;
        overflow: hidden;
        transform: scale(0.95) translateY(10px);
        opacity: 0;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: none;
      }

      .card.visible {
        display: flex;
        transform: scale(1) translateY(0);
        opacity: 1;
        pointer-events: auto;
      }

      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }

      .card-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #cdd6f4;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .card-header .close-btn {
        background: none;
        border: none;
        color: #a6adc8;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        transition: background 0.2s;
      }

      .card-header .close-btn:hover {
        color: #f38ba8;
        background: rgba(255, 255, 255, 0.05);
      }

      .memory-list {
        flex: 1;
        overflow-y: auto;
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .memory-item {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.04);
        border-radius: 10px;
        padding: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .memory-item:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: #89b4fa;
      }

      .memory-title {
        font-size: 12px;
        font-weight: 600;
        color: #89b4fa;
        margin-bottom: 4px;
        line-height: 1.4;
      }

      .memory-excerpt {
        font-size: 11px;
        color: #bac2de;
        line-height: 1.45;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        word-break: break-word;
      }
      
      .memory-excerpt.expanded {
        display: block;
        -webkit-line-clamp: unset;
      }

      .memory-meta {
        display: flex;
        justify-content: space-between;
        font-size: 9px;
        color: #6c7086;
        margin-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.03);
        padding-top: 6px;
      }

      .card-actions {
        display: flex;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        background: rgba(0, 0, 0, 0.2);
      }

      .action-btn {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.04);
        color: #cdd6f4;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: all 0.2s ease;
      }

      .action-btn:hover {
        background: #89b4fa;
        color: #11111b;
        border-color: #89b4fa;
      }

      .action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: rgba(255, 255, 255, 0.02) !important;
        color: #6c7086 !important;
        border-color: transparent !important;
      }

      .toast {
        position: absolute;
        bottom: 60px;
        left: 50%;
        transform: translateX(-50%);
        background: #2ec471;
        color: #11111b;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        z-index: 2147483647;
        opacity: 0;
        box-shadow: 0 4px 12px rgba(46, 196, 113, 0.3);
        transition: opacity 0.3s ease, transform 0.3s ease;
        pointer-events: none;
      }

      .toast.visible {
        opacity: 1;
        transform: translateX(-50%) translateY(-5px);
      }

      @keyframes pill-enter {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;

    const container = document.createElement('div');
    container.className = 'container';

    // The Floating Pill
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.innerHTML = `
      <span class="brain-icon">🧠</span>
      <span>Related Memories</span>
      <span class="count">${count}</span>
    `;

    // The Overlay Card
    const card = document.createElement('div');
    card.className = 'card';
    
    // Header
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header';
    cardHeader.innerHTML = `
      <h3>🧠 Related Memories</h3>
      <button class="close-btn" title="Close Panel">×</button>
    `;
    card.appendChild(cardHeader);

    // List of Memories
    const memoryList = document.createElement('div');
    memoryList.className = 'memory-list';
    
    currentMemories.forEach(mem => {
      const item = document.createElement('div');
      item.className = 'memory-item';
      
      const relevancePercent = mem.confidence ? Math.round(mem.confidence * 100) : null;
      const relevanceStr = relevancePercent ? `${relevancePercent}% match` : 'Related';

      item.innerHTML = `
        <div class="memory-title">${mem.title}</div>
        <div class="memory-excerpt">${mem.content}</div>
        <div class="memory-meta">
          <span style="text-transform: capitalize; font-weight: 600;">${mem.category}</span>
          <span>${relevanceStr}</span>
        </div>
      `;

      // Click to toggle full content expansion
      item.addEventListener('click', () => {
        const excerpt = item.querySelector('.memory-excerpt');
        excerpt.classList.toggle('expanded');
      });

      memoryList.appendChild(item);
    });
    card.appendChild(memoryList);

    // Quick Actions
    const cardActions = document.createElement('div');
    cardActions.className = 'card-actions';

    const rememberBtn = document.createElement('button');
    rememberBtn.className = 'action-btn';
    rememberBtn.innerHTML = '📌 Remember Page';

    const researchBtn = document.createElement('button');
    researchBtn.className = 'action-btn';
    researchBtn.innerHTML = '🔬 Research Page';

    cardActions.appendChild(rememberBtn);
    cardActions.appendChild(researchBtn);
    card.appendChild(cardActions);

    // Tiny Toast message indicator
    const toast = document.createElement('div');
    toast.className = 'toast';
    container.appendChild(toast);

    // Action button listeners
    const triggerAction = async (action, btn) => {
      btn.disabled = true;
      const originalText = btn.innerHTML;
      btn.innerHTML = '⏳ Processing...';
      
      chrome.runtime.sendMessage({
        type: 'SHARE',
        data: {
          url: pageContext.url,
          title: pageContext.title,
          action: action,
          source: 'chrome-extension-overlay'
        }
      }, (res) => {
        btn.disabled = false;
        btn.innerHTML = originalText;
        if (res && res.success) {
          toast.textContent = action === 'remember' ? '📌 Remembered page!' : '🔬 Research queued!';
          toast.classList.add('visible');
          setTimeout(() => toast.classList.remove('visible'), 2500);
        } else {
          toast.textContent = '❌ Action failed';
          toast.style.background = '#e74c3c';
          toast.style.boxShadow = '0 4px 12px rgba(231, 76, 60, 0.3)';
          toast.classList.add('visible');
          setTimeout(() => {
            toast.classList.remove('visible');
            toast.style.background = '#2ec471';
            toast.style.boxShadow = '0 4px 12px rgba(46, 196, 113, 0.3)';
          }, 2500);
        }
      });
    };

    rememberBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerAction('remember', rememberBtn);
    });

    researchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerAction('research', researchBtn);
    });

    // Toggle overlay visibility on pill click
    const toggleOverlay = (e) => {
      e.stopPropagation();
      const isVisible = card.classList.contains('visible');
      if (isVisible) {
        card.classList.remove('visible');
        pill.classList.remove('active');
      } else {
        card.classList.add('visible');
        pill.classList.add('active');
      }
    };

    pill.addEventListener('click', toggleOverlay);
    cardHeader.querySelector('.close-btn').addEventListener('click', toggleOverlay);

    // Prevent clicks inside card from closing it
    card.addEventListener('click', (e) => e.stopPropagation());

    // Close overlay if clicking outside the host
    document.addEventListener('click', () => {
      card.classList.remove('visible');
      pill.classList.remove('active');
    });

    container.appendChild(card);
    container.appendChild(pill);

    shadow.appendChild(style);
    shadow.appendChild(container);
    document.body.appendChild(pillHost);
  }

  function isBlocked(blocklist) {
    if (!Array.isArray(blocklist) || blocklist.length === 0) return false;
    let host = '';
    try {
      host = new URL(pageContext.url).hostname.toLowerCase();
    } catch {
      return false;
    }
    return blocklist.some((entry) => {
      const pattern = String(entry || '').trim().toLowerCase();
      return pattern && (host === pattern || host.endsWith(`.${pattern}`) || pageContext.url.toLowerCase().includes(pattern));
    });
  }

  // ---- Query brain after delay ----
  async function queryBrain() {
    const { passiveTracking = false, blocklist = [] } = await chrome.storage.sync.get(['passiveTracking', 'blocklist']);
    if (!passiveTracking || isBlocked(blocklist)) return;

    const query = pageContext.title || pageContext.url;
    if (!query) return;

    chrome.runtime.sendMessage(
      { type: 'QUERY_BRAIN', query, topK: 5 },
      (response) => {
        if (chrome.runtime.lastError) return;
        const memories = response?.memories || [];
        if (memories.length > 0) {
          currentMemories = memories;
          createPill(memories.length);
        }
      }
    );
  }

  // Wait 2 seconds after page load to avoid interfering with page rendering
  setTimeout(queryBrain, 2000);

  // ---- Listen for page context requests ----
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_PAGE_TEXT') {
      const selection = window.getSelection().toString().trim();
      const pageText = document.body.innerText.slice(0, 10000); // limit to 10k chars to avoid token blowout
      sendResponse({
        url: location.href,
        title: document.title,
        selection,
        pageText
      });
    }
    return true;
  });
})();
