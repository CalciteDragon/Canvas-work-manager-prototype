import { describe, expect, it } from 'vitest';
import { SECTION_REGISTRY, definitionFor } from './registry';

/**
 * Deliberately generic. Asserting each definition's default config against its own
 * section's schema would make this file import every section folder, so adding a type would
 * touch three places instead of two — and falsify the §30 claim the registry exists to
 * prove. That round trip belongs to the owning section's spec.
 */
describe('SECTION_REGISTRY (§29)', () => {
  it('ships §30’s first two section types', () => {
    expect(SECTION_REGISTRY.map((definition) => definition.type)).toEqual(['rich-text', 'task-list']);
  });

  it('gives every definition the members §29 pins', () => {
    for (const definition of SECTION_REGISTRY) {
      expect(definition.displayName.length).toBeGreaterThan(0);
      expect(definition.icon.length).toBeGreaterThan(0);
      expect(typeof definition.component).toBe('function');
      expect(typeof definition.createDefaultConfig()).toBe('object');
    }
  });

  it('keeps every type unique, so a lookup is unambiguous', () => {
    const types = SECTION_REGISTRY.map((definition) => definition.type);

    expect(new Set(types).size).toBe(types.length);
  });

  it('answers undefined for a type nothing registers', () => {
    // A real state: `data.json` is hand-editable and outlives any one registry.
    expect(definitionFor('timeline')).toBeUndefined();
    expect(definitionFor('rich-text')?.displayName).toBe('Rich Text');
  });
});
