/**
 * Serializable browser collector; stable keys allow paint-only geometry comparisons.
 * Slice 77 opts into content coordinates for shell planes, so scrolling to a canvas action
 * does not masquerade as moving the shell. Row planes retain their viewport coordinates.
 */
export function collectPlaneBoxes(source = globalThis.document, contentCoordinates = false) {
  const document = source?.contentCoordinates ? (source.document ?? globalThis.document) : source;
  contentCoordinates ||= source?.contentCoordinates === true;
  return ['app-top-bar', 'app-sidebar', 'app-project-page-navigation', 'app-project-header',
    'app-project-section-frame', 'app-shortcut-frame', 'app-dashboard-widget-frame'].flatMap(selector =>
    [...document.querySelectorAll(selector)].map((element, index) => {
      let { x, y, width, height } = element.getBoundingClientRect();
      let anchored=false;
      for(let current=element;current;current=current.parentElement)if(['sticky','fixed'].includes(document.defaultView.getComputedStyle(current).position)){anchored=true;break;}
      if(contentCoordinates && !anchored && ['app-top-bar','app-sidebar','app-project-page-navigation','app-project-header'].includes(selector)) {
        for(let ancestor=element.parentElement;ancestor;ancestor=ancestor.parentElement) {
          x+=ancestor.scrollLeft;y+=ancestor.scrollTop;
        }
      }
      // A Lab specimen names its panel, so the gate need not infer it from a box that may overflow.
      const panel = element.closest('[data-panel]')?.getAttribute('data-panel');
      return { selector, index, x, y, width, height, ...(panel ? { panel } : {}) };
    }));
}

/** Structural axe identity: content and generated styling are not a node's identity. */
export function axeNodeIdentity(selector, document = globalThis.document) {
  const element=document.querySelector(selector);if(!element)return selector;
  let anchor=element;
  while(anchor.parentElement && !anchor.getAttributeNames().some(name=>name.startsWith('data-')))anchor=anchor.parentElement;
  const attributes=anchor.getAttributeNames().filter(name=>name.startsWith('data-')).sort().map(name=>name+'='+anchor.getAttribute(name)).join('|');
  const path=[];
  for(let current=element;current!==anchor;current=current.parentElement)path.unshift(current.tagName+':'+[...current.parentElement.children].indexOf(current));
  const context=element.closest('.cdk-drag-preview')?'drag-preview':element.closest('.cdk-drag-dragging')?'dragging':'';
  return [context,attributes,anchor.tagName,...path,element.tagName,element.getAttribute('role')??'',element.getAttribute('aria-label')??''].join('|');
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
