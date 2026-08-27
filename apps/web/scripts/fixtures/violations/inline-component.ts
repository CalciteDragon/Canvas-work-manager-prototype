// `inlineStyleLanguage: "scss"` lets a component carry styles in its own file, so the
// checker has to read them too — including a template that interpolates, which once made
// the entire block invisible.
const accent = 'var(--color-accent)';

export const component = {
  selector: 'app-fixture',
  styles: [`.inline { box-shadow: 0 2px 8px rgb(0 0 0 / 40%); }`],
  template: `<div style="margin: 24px">Both halves are checked.</div>`,
};

export const interpolating = {
  selector: 'app-fixture-two',
  styles: [`.a { color: ${accent}; } .b { background: #fedcba; }`],
};
