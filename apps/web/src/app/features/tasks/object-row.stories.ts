import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular-vite';

/** §21's primitive without a task store: controls and title are independent siblings. */
@Component({
  selector: 'app-object-row-specimen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="object-row" id="object-row-story"
      [class.object-row--static]="variant() === 'static' || variant() === 'read-only'"
      [class.object-row--high-priority]="variant() === 'high-priority'"
      [class.object-row--overdue]="variant() === 'overdue'"
      [class.object-row--finished]="variant() === 'finished'">
      <span class="object-row__control">
        @if (variant() !== 'static' && variant() !== 'read-only') {
          <input class="checkbox" type="checkbox" [checked]="variant() === 'finished'" aria-label="Complete launch announcement" />
        }
      </span>
      @if (variant() === 'static' || variant() === 'read-only') {
        <span class="object-row__title">Draft the launch announcement</span>
      } @else {
        <a class="object-row__title" href="#object-row-story">Draft the launch announcement</a>
      }
      <span class="object-row__meta">{{ meta() }}</span>
      @if (variant() !== 'static' && variant() !== 'read-only') {
        <span class="object-row__tools"><button class="button button--ghost button--sm" type="button">Delete</button></span>
      }
      <span class="object-row__context">Website launch / Work / Tasks</span>
    </article>`,
})
class ObjectRowSpecimen {
  readonly variant = input('link');
  readonly meta = input('In progress · Due 2026-10-24');
}

const meta: Meta<ObjectRowSpecimen> = { title: 'Shared/ObjectRow', component: ObjectRowSpecimen };
export default meta;
type Story = StoryObj<ObjectRowSpecimen>;

export const LinkTitle: Story = {};
export const Static: Story = { args: { variant: 'static', meta: '2026-10-24' } };
export const HighPriority: Story = { args: { variant: 'high-priority', meta: 'High priority · Due 2026-10-24' } };
export const Overdue: Story = { args: { variant: 'overdue', meta: 'Due 2026-10-20 · Overdue' } };
export const Finished: Story = { args: { variant: 'finished', meta: 'Done · Completed 2026-10-21' } };
export const ReadOnly: Story = { args: { variant: 'read-only', meta: 'Blocked · Due 2026-10-24' } };
