/**
 * Keeps very wide Mermaid diagrams readable.
 *
 * Mermaid sizes a diagram to the column, which is right until the diagram is much wider
 * than the column: the domain's class diagram is about 3,800px across, and fitting that
 * into a 600px column shrinks its labels to noise. Past a threshold the diagram therefore
 * keeps its own size and scrolls sideways inside its box (see diagrams.css); below it,
 * fitting the column is still the nicer result and nothing is changed.
 *
 * The work is done on the rendered SVG because only Mermaid knows a diagram's natural
 * width — it records it as the element's max-width once the diagram is drawn.
 */
const TOO_WIDE = 1.4;

const widen = (svg: SVGElement) => {
  const container = svg.parentElement;
  if (!container || svg.dataset.cwmSized) return;
  const natural = Number.parseFloat(svg.style.maxWidth);
  if (!Number.isFinite(natural) || natural <= 0) return;
  svg.dataset.cwmSized = 'true';
  if (natural > container.clientWidth * TOO_WIDE) {
    svg.style.width = `${natural}px`;
    svg.style.maxWidth = 'none';
  }
};

const widenAll = () =>
  document.querySelectorAll<SVGElement>('.mermaid svg').forEach(widen);

export const keepWideDiagramsReadable = () => {
  if (typeof window === 'undefined') return;
  // Mermaid draws after hydration and again on every navigation, so watch rather than poll.
  const observer = new MutationObserver(widenAll);
  const start = () => {
    widenAll();
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
};
