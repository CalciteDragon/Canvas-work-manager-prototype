/**
 * The default VitePress theme, plus the small amount the diagrams need.
 */
import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import { keepWideDiagramsReadable } from './wide-diagrams';
import './diagrams.css';

export default {
  extends: DefaultTheme,
  enhanceApp() {
    keepWideDiagramsReadable();
  },
} satisfies Theme;
