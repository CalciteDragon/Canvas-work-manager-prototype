import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular-vite';
import { Icon } from '../components/icon/icon';

/**
 * Slice 72's shared control primitives (protocol §7.1). They are global classes in
 * `styles/_controls.scss`, so each story is plain markup; the toolbar's theme switch shows both
 * themes. Pointer states are real here: hover, press and tab through them.
 */
const meta: Meta = {
  title: 'Shared/Controls',
  decorators: [moduleMetadata({ imports: [Icon] })],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj;

const row = 'display:flex;flex-wrap:wrap;gap:var(--space-2);align-items:center';
const stack = 'display:grid;gap:var(--space-3)';

/** The four ranks in both sizes, a pressed set, a disabled button and two list rows. */
export const Buttons: Story = {
  render: () => ({
    template: `
      <div style="${stack}">
        <div style="${row}">
          <button type="button" class="button button--primary">Create</button>
          <button type="button" class="button">Cancel</button>
          <button type="button" class="button button--ghost">Preview</button>
          <button type="button" class="button button--danger">Archive project</button>
          <button type="button" class="button" disabled>Disabled</button>
        </div>
        <div style="${row}">
          <button type="button" class="button button--sm button--primary">Save</button>
          <button type="button" class="button button--sm">Cancel</button>
          <button type="button" class="button button--sm button--ghost">Edit</button>
          <button type="button" class="button button--sm button--danger">Revoke</button>
        </div>
        <div style="${row}" role="group" aria-label="Progress formula">
          <button type="button" class="button button--sm" aria-pressed="true">Count</button>
          <button type="button" class="button button--sm" aria-pressed="false">Weighted</button>
          <button type="button" class="button button--sm" aria-pressed="false">Manual</button>
        </div>
        <div>
          <button type="button" class="button button--row" aria-expanded="false"><span class="pill pill--accent">Milestone</span> Launch review</button>
          <button type="button" class="button button--row" aria-expanded="true"><span class="pill">Task</span> Draft the announcement</button>
        </div>
      </div>`,
  }),
};

/** Icon buttons for chrome, tools for frames and rows, and the three removal marks. */
export const IconButtonsAndTools: Story = {
  render: () => ({
    template: `
      <div style="${stack}">
        <div style="${row}">
          <button type="button" class="icon-button" aria-label="Undo"><app-icon name="undo" /></button>
          <button type="button" class="icon-button" aria-label="Redo" disabled><app-icon name="redo" /></button>
          <button type="button" class="icon-button" aria-label="More project actions"><app-icon name="more" /></button>
          <button type="button" class="icon-button icon-button--sm" aria-label="Close"><app-icon name="close" /></button>
          <button type="button" class="icon-button icon-button--danger" aria-label="Delete"><app-icon name="remove" /></button>
        </div>
        <div style="${row}">
          <button type="button" class="tool" aria-label="Move section"><app-icon name="grip" /></button>
          <button type="button" class="tool" aria-label="Collapse"><app-icon name="chevron" /></button>
          <button type="button" class="tool" aria-label="Open source"><app-icon name="open" /></button>
          <button type="button" class="tool tool--danger" aria-label="Remove section"><app-icon name="remove-section" /></button>
          <button type="button" class="tool" aria-label="Delete task"><app-icon name="remove" /></button>
          <button type="button" class="tool" aria-label="Remove shortcut"><app-icon name="unlink" /></button>
        </div>
      </div>`,
  }),
};

/** One field treatment for text, number, date, select and textarea, with visible labels. */
export const Fields: Story = {
  render: () => ({
    template: `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--layout-project-column-width),1fr));gap:var(--space-3)">
        <label class="control-label">Project name <input class="field" type="text" placeholder="Website launch" /></label>
        <label class="control-label">Estimate <input class="field" type="number" value="3" /></label>
        <label class="control-label">Due date <input class="field" type="date" value="2026-09-30" /></label>
        <label class="control-label">Prompt
          <select class="select"><option>What went well?</option><option>What would you change?</option></select>
        </label>
        <label class="control-label">Invalid <input class="field" type="text" aria-invalid="true" /></label>
        <label class="control-label">Disabled <input class="field" type="text" value="Locked" disabled /></label>
        <label class="control-label" style="grid-column:1/-1">Reflection <textarea class="field"></textarea></label>
      </div>`,
  }),
};

/** Native checkboxes and radios, drawn from tokens, with targets sized for pointer and touch. */
export const ChecksAndRadios: Story = {
  render: () => ({
    template: `
      <div style="${stack}">
        <fieldset style="border:0;padding:0;margin:0;${row}">
          <legend class="control-label">Agent permissions</legend>
          <label><input class="checkbox" type="checkbox" checked /> Read</label>
          <label><input class="checkbox" type="checkbox" /> Write</label>
          <label><input class="checkbox" type="checkbox" disabled /> Archive</label>
        </fieldset>
        <fieldset style="border:0;padding:0;margin:0;${row}">
          <legend class="control-label">Appearance</legend>
          <label><input class="radio" type="radio" name="story-theme" checked /> Dark</label>
          <label><input class="radio" type="radio" name="story-theme" /> Light</label>
          <label><input class="radio" type="radio" name="story-theme" /> Match device</label>
        </fieldset>
      </div>`,
  }),
};

/** Pills for state in words, the one link look, and the separated danger zone. */
export const PillsLinksAndDangerZone: Story = {
  render: () => ({
    template: `
      <div style="${stack}">
        <div style="${row}">
          <span class="pill">Planning</span>
          <span class="pill pill--accent">Agent</span>
          <span class="pill pill--success">Done</span>
          <span class="pill pill--warning">Overdue</span>
          <span class="pill pill--danger">Archived</span>
        </div>
        <p>Owned by <a class="link" href="#kitchen">Kitchen</a>.</p>
        <div style="display:grid;justify-items:start;gap:var(--space-2)">
          <button type="button" class="button button--sm">Rename</button>
          <div class="danger-zone"><button type="button" class="button button--sm button--danger">Archive project</button></div>
        </div>
      </div>`,
  }),
};
