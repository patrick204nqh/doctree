/**
 * dom.js
 * Small DOM builders and the menu behaviour shared by the toolbar, folder and breadcrumb menus.
 */
export const ICON_FOLDER = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.5a1 1 0 0 1 1-1h3.2l1.3 1.5h6.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
export const ICON_FILE   = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5l3 3V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1zM9 1.5v3h3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';

export function icon(svg) {
  const template = document.createElement('template');
  template.innerHTML = svg;
  return template.content.firstElementChild;
}

export function textSpan(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

export function typing() {
  return /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
}

/** A popover menu opened by a button: fills on open, places under the anchor, focuses the first item. */
export function setupMenu(menu, button, fill, anchor = button.parentElement) {
  menu.addEventListener('beforetoggle', (e) => {
    if (e.newState === 'open') fill();
  });
  menu.addEventListener('toggle', (e) => {
    button.setAttribute('aria-expanded', String(e.newState === 'open'));
    if (e.newState !== 'open') return;
    placeMenu(menu, anchor);
    (menu.querySelector('[autofocus]') ?? menu.querySelector('button:not([disabled])'))?.focus();
  });
  menuArrows(menu);
}

export function menuArrows(menu) {
  menu.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...menu.querySelectorAll('button:not([disabled])')];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  });
}

export function placeMenu(menu, anchor) {
  const rect = anchor.getBoundingClientRect();
  menu.style.top = rect.bottom + 4 + 'px';
  menu.style.left = Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8)) + 'px';
}

export function menuItem(label, value, data) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('role', 'menuitem');
  Object.assign(btn.dataset, data);
  btn.append(textSpan('m-label', label));
  if (value) btn.append(textSpan('m-value', value));
  return btn;
}
