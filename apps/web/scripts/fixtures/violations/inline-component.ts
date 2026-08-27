// `inlineStyleLanguage: "scss"` lets a component carry styles in its own file, so the
// checker has to read them too.
export const component = {
  selector: 'app-fixture',
  styles: [`.inline { box-shadow: 0 2px 8px rgb(0 0 0 / 40%); }`],
  template: `<div style="margin: 24px">Both halves are checked.</div>`,
};
