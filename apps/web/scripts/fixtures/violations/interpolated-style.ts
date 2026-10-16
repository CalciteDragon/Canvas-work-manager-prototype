// Slice 72.1: style text held in TypeScript, the shapes stories use. A module-scope const
// interpolated into a `style` attribute is checked as if written there; an interpolation the
// checker cannot resolve is refused; and a decorator's template string is markup too, though it
// is not a `template:` property.
const row = 'display:flex;gap:12px';
const quiet = 'display:grid;gap:var(--space-3)';

export const story = {
  render: () => ({
    template: `<div style="${row}">Resolved and checked.</div>`,
  }),
};

export const computed = (gap: string) => ({
  template: `<div style="${gap}">Nothing to resolve.</div>`,
});

export const decorator = (inner: string) => `<div style="height: 24rem">${inner}</div>`;

// Controls: tokens through a const, and an unresolvable interpolation outside the attribute.
export const clean = {
  render: () => ({ template: `<div style="${quiet}">Tokens only.</div>` }),
};
export const wrapper = (inner: string) => `<div style="gap: var(--space-2)">${inner}</div>`;

// A parameter that shadows a module const is not that const, and a `<style>` block is a style
// position too: both are unresolved.
const gap = 'gap: var(--space-2)';
export const shadowed = (gap: string) => `<div style="${gap}">Not the module const.</div>`;
export const block = (height: string) => `<style>.a { height: ${height} }</style>`;
