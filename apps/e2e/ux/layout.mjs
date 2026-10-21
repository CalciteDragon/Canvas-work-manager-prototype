/** Serializable browser collector; stable keys allow paint-only geometry comparisons. */
export function collectPlaneBoxes(document = globalThis.document) {
  return ['app-top-bar', 'app-sidebar', 'app-project-page-navigation', 'app-project-header',
    'app-project-section-frame', 'app-shortcut-frame', 'app-dashboard-widget-frame'].flatMap(selector =>
    [...document.querySelectorAll(selector)].map((element, index) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { selector, index, x, y, width, height };
    }));
}

/**
 * Serializable browser collector for the control census (slice 72, acceptance 9). Self-contained,
 * because Playwright serializes it into the page. `scope` separates gated product controls from
 * prototype scaffolding and rendered prose. A checkbox or radio is measured by the larger of its
 * own box and its label's, as WCAG 2.5.8 measures the target.
 */
export function collectControls(document = globalThis.document) {
  const view = document.defaultView;
  const onPrototypeRoute = view.location.pathname.startsWith('/prototype/');
  const box = element => { const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height }; };
  const labelOf = element => element.closest('label')
    ?? (element.id ? document.querySelector('label[for="' + element.id + '"]') : null);
  return [...document.querySelectorAll('button,input,select,textarea,a,[role=button],[role=slider]')].map(element => {
    const style = view.getComputedStyle(element);
    const own = box(element);
    const record = {
      text: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 80),
      id: element.id, panel: element.closest('[data-panel]')?.getAttribute('data-panel') ?? null, tag: element.tagName.toLowerCase(), type: element.getAttribute('type'), role: element.getAttribute('role'),
      class: element.getAttribute('class') ?? '', ...own,
      color: style.color, background: style.backgroundColor, border: style.border, fontSize: style.fontSize,
      scope: onPrototypeRoute || element.closest('app-dev-panel') ? 'prototype' : element.closest('.markdown-renderer') ? 'prose' : 'product',
    };
    if (record.tag === 'input' && (record.type === 'checkbox' || record.type === 'radio')) {
      const label = labelOf(element);
      const other = label ? box(label) : own;
      record.target = other.width * other.height > own.width * own.height
        ? { width: other.width, height: other.height } : { width: own.width, height: own.height };
    }
    return record;
  }).filter(record => record.width > 0 && record.height > 0);
}
