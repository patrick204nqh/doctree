/**
 * content_script.js
 * Runs on file:// pages. Detects .md files, reads the raw markdown,
 * stores it in chrome.storage.local, then redirects to the viewer.
 */
(function () {
  const url = window.location.href;

  // Only handle .md files (ignore query/hash)
  if (!/\.md([?#].*)?$/i.test(url)) return;

  // Chrome renders plain-text files inside a <pre> tag
  const raw = document.querySelector('pre')?.innerText ?? document.body.innerText;

  if (!raw || raw.trim() === '') return;

  chrome.storage.local.set({ [url]: raw }, () => {
    if (chrome.runtime.lastError) {
      console.error('[Doctree] storage error:', chrome.runtime.lastError);
      return;
    }
    const viewerUrl =
      chrome.runtime.getURL('viewer/viewer.html') +
      '?url=' +
      encodeURIComponent(url);
    window.location.replace(viewerUrl);
  });
})();
