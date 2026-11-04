import type { Meta, StoryObj } from '@storybook/angular-vite';

/**
 * Slice 79's two `.state-message` variants that are not failures (§21). They are global classes
 * in `styles/_controls.scss`, so each story is plain markup; `FailureMessage` has the failed form.
 */
const meta: Meta = {
  title: 'Shared/Feedback/State message',
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj;

/** The empty variant: a muted sentence, alone or with its one action. */
export const Empty: Story = {
  render: () => ({
    template: `
      <div style="display:grid;gap:var(--space-3)">
        <div class="state-message state-message--empty"><p class="state-message__sentence">No projects yet.</p></div>
        <div class="state-message state-message--empty">
          <p class="state-message__sentence">No projects yet.</p>
          <button type="button" class="button button--sm button--primary">New project</button>
        </div>
      </div>
    `,
  }),
};

/** The archived variant alone: the quiet band, before it holds a restore choice. */
export const Archived: Story = {
  render: () => ({
    template: `
      <div class="state-message state-message--archived">
        <p class="state-message__sentence">“Legacy attic” is archived.</p>
      </div>
    `,
  }),
};
