import type { Meta, StoryObj } from '@storybook/angular-vite';
import { componentWrapperDecorator, moduleMetadata } from '@storybook/angular-vite';
import { labSection, stubSectionDefinition } from '../../../../prototype/design-lab/design-lab-fixtures';
import { SectionCanvasFrame } from '../../../../prototype/design-lab/section-canvas-frame';
import { ProjectSectionFrame } from './project-section-frame';

/**
 * §4's ProjectSection variants.
 *
 * **Every story is wrapped in `SectionCanvasFrame`**, and that is not decoration. The frame
 * writes only `[attr.data-column-span]`; the actual width comes from
 * `.section-canvas--flow .section-canvas__item--span-N` in `project-canvas.scss`, applied by
 * `ProjectCanvas` to a wrapper element, in *that* component's encapsulated stylesheet. A bare
 * frame shows no width difference at all — Full Width and Half Width would be pixel
 * identical, and the variant set would be a lie.
 *
 * The content is the Design Lab's **stub** definition, shared with the catalogue: a real
 * registry definition's content component injects a store which injects the gateway, and a
 * story is not the place to stand up a data layer.
 */
const meta: Meta<ProjectSectionFrame> = {
  title: 'Projects/ProjectSectionFrame',
  component: ProjectSectionFrame,
  decorators: [
    moduleMetadata({ imports: [SectionCanvasFrame] }),
    componentWrapperDecorator(
      (story) => `<app-section-canvas-frame [columnSpan]="section.columnSpan">${story}</app-section-canvas-frame>`,
    ),
  ],
  args: {
    section: labSection({ title: 'Launch notes' }),
    definition: stubSectionDefinition(),
    rename: async () => true,
    projectDataRevision: 0,
    projectHierarchyRevision: 0,
  },
};

export default meta;
type Story = StoryObj<ProjectSectionFrame>;

export const FullWidth: Story = {
  args: { section: labSection({ title: 'Launch notes', columnSpan: 12 }) },
};

/** Must render visibly narrower than Full Width, or the wrapper above is not working. */
export const HalfWidth: Story = {
  args: { section: labSection({ title: 'Launch notes', columnSpan: 6 }) },
};

export const Collapsed: Story = {
  args: { section: labSection({ title: 'Launch notes', collapsed: true }) },
};

/** Layout and archive controls are available in the frame without a separate mode. */
export const DirectChrome: Story = {};

export const EmptyContent: Story = {
  args: { section: labSection({ title: 'Reflections', config: { state: 'empty' } }) },
};

export const LoadingContent: Story = {
  args: { section: labSection({ title: 'Reflections', config: { state: 'loading' } }) },
};
