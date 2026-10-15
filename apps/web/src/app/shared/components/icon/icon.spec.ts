import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, Icon } from './icon';

describe('Icon (§27, slice 72)', () => {
  it.each(ICON_NAMES)('renders %s as a non-empty decorative SVG', (name) => {
    const fixture = TestBed.createComponent(Icon);
    fixture.componentRef.setInput('name', name);
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg') as SVGElement | null;
    expect(svg, name).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden'), name).toBe('true');
    expect(svg?.getAttribute('focusable'), name).toBe('false');
    expect(svg?.getAttribute('viewBox'), name).toBe('0 0 24 24');
    expect(svg?.querySelectorAll('path, circle, rect, line, polyline').length, name).toBeGreaterThan(0);
  });
});
