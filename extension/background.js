// Total Recall — Background Service Worker
// Handles context menus, message routing, and passive browsing buffer.

importScripts('lib/preconfigured.js', 'lib/brain-client.js');

// Destructure for convenience after importScripts populates self.BrainClient
const { share, search, healthCheck } = self.BrainClient;

// ---------------------------------------------------------------------------
// Context menu registration
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'send-to-brain',
    title: 'Send to Brain',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'remember-this',
    title: 'Remember This',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'research-this',
    title: 'Research This',
    contexts: ['selection']
  });
});

// ---------------------------------------------------------------------------
// Context menu click handler
// ---------------------------------------------------------------------------
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'send-to-brain') {
      await share({
        url: tab.url,
        title: tab.title,
        action: 'research',
        source: 'chrome-extension'
      });
      showBadge('\u2713', '#22c55e');
    } else if (info.menuItemId === 'remember-this') {
      await share({
        url: tab.url,
        title: tab.title,
        excerpt: info.selectionText,
        action: 'remember',
        source: 'chrome-extension'
      });
      showBadge('\u2713', '#22c55e');
    } else if (info.menuItemId === 'research-this') {
      await share({
        excerpt: info.selectionText,
        action: 'research',
        source: 'chrome-extension'
      });
      showBadge('\u2713', '#22c55e');
    }
  } catch (err) {
    console.error('Brain API error:', err);
    showBadge('!', '#ef4444');
  }
});

// ---------------------------------------------------------------------------
// Badge helper
// ---------------------------------------------------------------------------
function showBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
}

// ---------------------------------------------------------------------------
// Message listener (popup, content-script, sidepanel → background)
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'QUERY_BRAIN') {
    search(msg.query, msg.topK || 3)
      .then(data => sendResponse({ memories: data.results || [] }))
      .catch(err => sendResponse({ memories: [], error: err.message }));
    return true; // keep channel open for async response
  }

  if (msg.type === 'SHARE') {
    share(msg.data)
      .then(data => sendResponse({ success: true, ...data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.type === 'HEALTH_CHECK') {
    healthCheck()
      .then(data => sendResponse({ connected: true, ...data }))
      .catch(() => sendResponse({ connected: false }));
    return true;
  }

  if (msg.type === 'OPEN_SIDE_PANEL') {
    const tabId = sender.tab?.id;
    if (!chrome.sidePanel?.open || !tabId) {
      sendResponse({ success: false, error: 'Side panel is unavailable for this tab.' });
      return false;
    }
    chrome.sidePanel.open({ tabId })
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
