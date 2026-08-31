/* `preview.ts` imports the application's stylesheet for its side effect. TypeScript has no
   idea what a `.scss` module is, and `@angular/build` never type-checks this file. */
declare module '*.scss';
