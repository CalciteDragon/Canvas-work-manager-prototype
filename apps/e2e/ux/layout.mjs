/** Serializable browser collector; stable keys allow paint-only geometry comparisons. */
export function collectPlaneBoxes(document = globalThis.document) {
  return ['app-top-bar', 'app-sidebar', 'app-project-page-navigation', 'app-project-header',
    'app-project-section-frame', 'app-shortcut-frame', 'app-dashboard-widget-frame'].flatMap(selector =>
    [...document.querySelectorAll(selector)].map((element, index) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { selector, index, x, y, width, height };
    }));
}
