import type { ProjectLayoutMode, SectionColumnSpan } from '@cwm/contracts';

const SUPPORTED_SPANS = [4, 6, 8, 12] as const satisfies readonly SectionColumnSpan[];
const DISTANCE_EPSILON = 0.01;

export interface SnapColumnSpanInput {
  mode: ProjectLayoutMode;
  trackWidth: number;
  columnGap: number;
  startSpan: SectionColumnSpan;
  deltaPx: number;
  edge: 'start' | 'end';
}

/** Convert a pointer drag into the nearest supported width for the current canvas layout. */
export const snapColumnSpan = ({
  mode,
  trackWidth,
  columnGap,
  startSpan,
  deltaPx,
  edge,
}: SnapColumnSpanInput): SectionColumnSpan => {
  if (!Number.isFinite(trackWidth) || trackWidth <= 0 || !Number.isFinite(deltaPx)) return startSpan;

  const requestedWidth =
    widthForSpan(mode, trackWidth, columnGap, startSpan) + deltaPx * (edge === 'start' ? -1 : 1);
  return SUPPORTED_SPANS.reduce((best, candidate) => {
    const distance = Math.abs(widthForSpan(mode, trackWidth, columnGap, candidate) - requestedWidth);
    const bestDistance = Math.abs(widthForSpan(mode, trackWidth, columnGap, best) - requestedWidth);
    if (distance < bestDistance - DISTANCE_EPSILON) return candidate;
    if (Math.abs(distance - bestDistance) <= DISTANCE_EPSILON && candidate > best) return candidate;
    return best;
  }, SUPPORTED_SPANS[0]);
};

/** Step through the existing width choices for the resize handle's keyboard controls. */
export const stepColumnSpan = (span: SectionColumnSpan, direction: -1 | 1): SectionColumnSpan => {
  const index = SUPPORTED_SPANS.indexOf(span);
  return SUPPORTED_SPANS[Math.max(0, Math.min(SUPPORTED_SPANS.length - 1, index + direction))];
};

const widthForSpan = (
  mode: ProjectLayoutMode,
  trackWidth: number,
  columnGap: number,
  span: SectionColumnSpan,
): number => {
  if (mode === 'flow') return (span / 12) * trackWidth;
  const gap = Math.max(0, columnGap);
  const columnWidth = Math.max(0, (trackWidth - 11 * gap) / 12);
  return span * columnWidth + (span - 1) * gap;
};
