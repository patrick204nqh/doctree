// Runs from <head> before first paint so the page never flashes the wrong theme or width.
document.documentElement.dataset.theme =
  localStorage.getItem('doctree-theme') ||
  (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.dataset.width = localStorage.getItem('doctree-width') || 'full';
