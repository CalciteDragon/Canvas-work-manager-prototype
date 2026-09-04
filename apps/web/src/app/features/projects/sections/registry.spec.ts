import { displayNameOf } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { SECTION_REGISTRY, definitionFor } from './registry';

/**
 * Deliberately generic. Asserting each definition's default config against its own
 * section's schema would make this file import every section folder, so adding a type would
 * touch three places instead of two — and falsify the §30 claim the registry exists to
 * prove. That round trip belongs to the owning section's spec.
 */
describe('SECTION_REGISTRY (§29)', () => {
  it('ships the §30 section types that exist', () => {
    expect(SECTION_REGISTRY.map((definition) => definition.type)).toEqual(['rich-text', 'task-list', 'sub-projects', 'progress', 'reflections', 'timeline', 'recent-activity']);
  });

  it('gives every definition the members §29 pins', () => {
    for (const definition of SECTION_REGISTRY) {
      expect(definition.displayName.length).toBeGreaterThan(0);
      expect(definition.icon.length).toBeGreaterThan(0);
      expect(typeof definition.component).toBe('function');
      expect(typeof definition.createDefaultConfig()).toBe('object');
    }
  });

  it('keeps every display name in step with the contracts default', () => {
    // `displayName` stays a field here — it is what a designer edits and what Quick add
    // renders. This is the guard, not a second definition: the next type whose name the
    // derivation cannot produce fails here, at the moment it is added, rather than surfacing
    // later as a section the removal dialog and the frame call different things.
    for (const definition of SECTION_REGISTRY) {
      expect(definition.displayName).toBe(displayNameOf(definition.type));
    }
  });

  it('keeps every type unique, so a lookup is unambiguous', () => {
    const types = SECTION_REGISTRY.map((definition) => definition.type);

    expect(new Set(types).size).toBe(types.length);
  });

  it('answers undefined for a type nothing registers', () => {
    // A real state: `data.json` is hand-editable and outlives any one registry.
    expect(definitionFor('calendar')).toBeUndefined();
    expect(definitionFor('timeline')?.displayName).toBe('Timeline');
    expect(definitionFor('rich-text')?.displayName).toBe('Rich Text');
  });
});
