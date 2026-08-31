import { withThemeByDataAttribute } from '@storybook/addon-themes';
import type { Preview } from '@storybook/angular-vite';
import '../src/styles.scss';

/**
 * §22's two themes, as a toolbar switch. `parentSelector` defaults to `html` already; it is
 * passed explicitly because that default is exactly what `_tokens.scss` depends on — its
 * light block is `:root[data-theme='light']`, so an attribute written anywhere else would
 * make the light theme silently unreachable.
 */
const preview: Preview = {
  decorators: [
    withThemeByDataAttribute({
      attributeName: 'data-theme',
      defaultTheme: 'dark',
      themes: { dark: 'dark', light: 'light' },
      parentSelector: 'html',
    }),
  ],
  parameters: {
    controls: { matchers: { date: /Date$/i } },
  },
};

export default preview;
