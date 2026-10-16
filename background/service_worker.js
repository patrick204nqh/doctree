/**
 * service_worker.js
 * Opens the viewer from the toolbar icon and cleans up storage entries.
 */

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.update(tab.id, { url: chrome.runtime.getURL('viewer/viewer.html') });
});

// Single-file mode stores the raw text in chrome.storage.local; the viewer
// asks for the key to be removed when it unloads.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'REMOVE_STORAGE_KEY' && message.key) {
    chrome.storage.local.remove(message.key, () => {
      sendResponse({ ok: true });
    });
    return true; // keep channel open for async sendResponse
  }
});
