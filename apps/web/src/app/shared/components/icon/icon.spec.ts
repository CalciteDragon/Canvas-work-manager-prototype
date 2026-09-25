import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Icon, type IconName } from './icon';

describe('Icon (§27)', () => {
  it('renders each supported chrome icon as a decorative SVG', () => {
    const names: IconName[] = [
      'grip',
      'chevron',
      'plus',
      'archive',
      'remove',
      'settings',
      'resize',
    ];

    for (const name of names) {
      const fixture = TestBed.createComponent(Icon);
      fixture.componentRef.setInput('name', name);
      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg') as SVGElement | null;
      expect(svg, name).not.toBeNull();
      expect(svg?.getAttribute('aria-hidden'), name).toBe('true');
      expect(svg?.getAttribute('viewBox'), name).toBe('0 0 24 24');
    }
  });
});
