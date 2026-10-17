import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { expect, userEvent, within } from 'storybook/test';
import { LiftFocus } from './lift-focus';

/** Native top-layer specimens, with the same paint and focus helper as the product. */
@Component({
  selector: 'app-lift-specimen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="button" type="button" (click)="open()">Open lift</button>
    <dialog class="lift" [class.lift--side]="kind() === 'side'" [class.lift--sheet]="kind() === 'sheet'"
      [class.lift--popover]="kind() === 'popover'" [class.lift--dialog]="kind() === 'dialog'"
      aria-label="Lift specimen" (keydown)="keydown($event)">
      <h2 tabindex="-1">Lift specimen</h2>
      <p>Content over the busy ground.</p>
      <button class="button" type="button" (click)="close()">Close</button>
    </dialog>`,
})
class LiftSpecimen {
  readonly kind = input('dialog');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private focus: LiftFocus | null = null;
  open(): void {
    const host = this.host.nativeElement;
    this.focus = new LiftFocus(host.querySelector('button'), () => null);
    const dialog = host.querySelector('dialog')!;
    if (this.kind() === 'side' || this.kind() === 'popover') {
      dialog.setAttribute('popover', 'auto');
      dialog.showPopover();
    } else dialog.showModal();
    this.focus.enter(dialog.querySelector('h2'));
  }
  close(): void {
    const dialog = this.host.nativeElement.querySelector('dialog')!;
    this.focus?.restore(dialog);
    if (dialog.hasAttribute('popover')) dialog.hidePopover();
    else dialog.close();
  }
  keydown(event: KeyboardEvent): void { if (event.key === 'Escape') { event.preventDefault(); this.close(); } }
}

const meta: Meta<LiftSpecimen> = { title: 'Shared/Lifts', component: LiftSpecimen };
export default meta;
type Story = StoryObj<LiftSpecimen>;
const interaction: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const opener = canvas.getByRole('button', { name: 'Open lift' });
  await userEvent.click(opener);
  await expect(canvas.getByRole('heading', { name: 'Lift specimen' })).toHaveFocus();
  await userEvent.keyboard('{Escape}');
  await expect(opener).toHaveFocus();
};
export const Side: Story = { args: { kind: 'side' }, play: interaction };
export const Sheet: Story = { args: { kind: 'sheet' }, play: interaction };
export const Popover: Story = { args: { kind: 'popover' }, play: interaction };
export const Dialog: Story = { args: { kind: 'dialog' }, play: interaction };
