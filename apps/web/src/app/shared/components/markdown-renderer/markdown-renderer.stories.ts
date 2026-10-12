import type { Meta, StoryObj } from '@storybook/angular-vite';
import { componentWrapperDecorator } from '@storybook/angular-vite';
import { MarkdownRenderer } from './markdown-renderer';

const source = '# Launch plan\n\nA **small**, *changeable* prototype.\n\n- Write the notes\n- Review the result\n\n1. Try it\n2. Learn from it\n\n> Keep decisions close to the work.\n\nUse `config.markdown` and [the docs](https://example.com).\n\n```ts\nconst source = "# Launch plan";\n```\n\n---\n\n| Work | Status |\n| :--- | ---: |\n| Authoring | Ready |\n\n~~An old idea~~';

const meta: Meta<MarkdownRenderer> = {
  title: 'Shared/MarkdownRenderer',
  component: MarkdownRenderer,
  args: { source },
};
export default meta;
type Story = StoryObj<MarkdownRenderer>;

/** The supported dialect, with headings nested under the frame's h2. */
export const Prose: Story = {};
export const Empty: Story = { args: { source: '' } };
export const LiteralHtmlAndNoImages: Story = {
  args: { source: '<script>window.__x = 1</script>\n\n<img src=x onerror=alert(1)>\n\n![Remote image](https://example.com/image.png)\n\n[Unsafe](javascript:alert(1))' },
};
export const NarrowContent: Story = {
  decorators: [componentWrapperDecorator((story) => `<div style="max-inline-size: var(--layout-drawer-width)">${story}</div>`)],
};
