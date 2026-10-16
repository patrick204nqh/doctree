/**
 * state.js
 * What more than one module needs: the open folder and file, the shared page elements,
 * and saved preferences. Anything only one module uses stays in that module.
 */
const $ = (id) => document.getElementById(id);

export const bodyEl         = $('markdown-body');
export const fileNameEl     = $('file-name');
export const sidebar        = $('sidebar');
export const treeEl         = $('tree');
export const mainEl         = $('main');
export const contentWrapper = $('content-wrapper');
export const resizeHandle   = $('resize-handle');
export const copyGroup      = $('copy-group');
export const treeToggleBtn  = $('tree-toggle');
export const quickBtn       = $('quick-btn');

export const MAC = /mac/i.test(navigator.platform);

export const state = {
  rootHandle: null,    // FileSystemDirectoryHandle (folder mode)
  currentPath: [],     // path array of the displayed file
  currentHandle: null, // FileSystemFileHandle of the displayed file
  currentStamp: '',    // lastModified:size when it was read
  allFiles: [],        // every shown file, flat, for quick open
  currentFolder: null, // saved record of the opened folder: { id, name, handle, base, used }
  folders: [],         // saved folders, most recently used first
};

/** Preferences in localStorage. theme.js reads "theme" and "width" before first paint. */
export const pref = {
  get: (key) => localStorage.getItem('doctree-' + key),
  set: (key, value) => localStorage.setItem('doctree-' + key, value),
  remove: (key) => localStorage.removeItem('doctree-' + key),
  on: (key, fallback) => (pref.get(key) ?? (fallback ? 'on' : 'off')) === 'on',
  setOn: (key, on) => pref.set(key, on ? 'on' : 'off'),
};
