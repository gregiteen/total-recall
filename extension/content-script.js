// Total Recall — Content Script
// Injected into every page. Queries the brain for related memories and shows
// a floating pill in the bottom-right corner when matches are found.
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

  // ---- Create floating pill with Shadow DOM ----
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

      .pill {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: #1e1e2e;
        color: #cdd6f4;
        border: 1px solid #313244;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        user-select: none;
        opacity: 0;
        transform: translateY(10px);
        animation: pill-enter 0.3s ease forwards;
      }

      .pill:hover {
        border-color: #89b4fa;
        transform: translateY(-2px);
        box-shadow: 0 6px 24px rgba(137, 180, 250, 0.15);
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

      @keyframes pill-enter {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;

    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.innerHTML = `
      <span class="brain-icon">🧠</span>
      <span>${count} related</span>
      <span class="count">${count}</span>
    `;

    pill.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
    });

    shadow.appendChild(style);
    shadow.appendChild(pill);
    document.body.appendChild(pillHost);
  }

  // ---- Query brain after delay ----
  function queryBrain() {
    const query = pageContext.title || pageContext.url;
    if (!query) return;

    chrome.runtime.sendMessage(
      { type: 'QUERY_BRAIN', query, topK: 5 },
      (response) => {
        if (chrome.runtime.lastError) return;
        const memories = response?.memories || [];
        if (memories.length > 0) {
          createPill(memories.length);
        }
      }
    );
  }

  // Wait 2 seconds after page load to avoid interfering with page rendering
  setTimeout(queryBrain, 2000);
})();
