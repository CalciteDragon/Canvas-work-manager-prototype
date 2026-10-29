import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, input, signal, viewChild } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Toast } from './toast';

/** Browser-only harness for manual popover ordering, Escape and native focus restoration. */
@Component({
  selector: 'app-toast-story',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Toast],
  styles: [':host { display: block; anchor-name: --toast-track; } [data-toast-menu-opener] { anchor-name: --toast-story-menu; } #toast-story-menu { position-anchor: --toast-story-menu; }'],
  template: `
    <button #opener class="button" data-toast-opener (click)="open.set(true)">Show feedback</button>
    <button class="button" data-toast-menu-opener popovertarget="toast-story-menu">Open menu</button>
    <button class="button" (click)="modal.showModal()">Open modal</button>
    <div id="toast-story-menu" class="lift lift--popover menu" popover="auto"><button class="menu__item">Menu action</button></div>
    <app-toast [open]="open()" [tone]="tone()" [message]="tone() === 'alert' ? 'Could not remove the section. Try again.' : 'Removed the Notes section.'" [detail]="detail()" (dismissed)="dismiss()">
      @if (withUndo()) { <button class="button" type="button">Undo</button> }
    </app-toast>
    <dialog #modal class="lift lift--dialog"><h2>Confirm change</h2><button class="button" (click)="modal.close()">Close modal</button></dialog>
    <span data-toast-dismissals>{{ dismissals() }}</span>
  `,
})
class ToastStory {
  readonly tone = input<'status' | 'alert'>('status');
  readonly withUndo = input(false);
  readonly detail = input<string | null>(null);
  protected readonly open = signal(false);
  protected readonly dismissals = signal(0);
  private readonly opener = viewChild<ElementRef<HTMLButtonElement>>('opener');
  private readonly injector = inject(Injector);

  protected dismiss(): void {
    this.open.set(false);
    this.dismissals.update(value => value + 1);
    // The caller supplies the surviving control; the presentational toast never owns focus.
    afterNextRender(() => this.opener()?.nativeElement.focus(), { injector: this.injector });
  }
}

const meta: Meta<ToastStory> = { title: 'Shared/Feedback/Toast', component: ToastStory };
export default meta;
type Story = StoryObj<ToastStory>;

const openAndEscape = async (canvasElement: HTMLElement, layer?: 'menu' | 'modal') => {
  const canvas = within(canvasElement);
  const opener = canvas.getByRole('button', { name: 'Show feedback' });
  await userEvent.click(opener);
  const toast = canvasElement.querySelector<HTMLElement>('[data-toast]')!;
  await waitFor(() => expect(toast.matches(':popover-open')).toBe(true));
  const dismiss = canvas.getByRole('button', { name: 'Dismiss' });
  if (layer === 'menu') {
    await userEvent.click(canvas.getByRole('button', { name: 'Open menu' }));
    await expect(canvasElement.querySelector('#toast-story-menu')!.matches(':popover-open')).toBe(true);
    await expect(toast.matches(':popover-open')).toBe(true);
  }
  if (layer === 'modal') {
    await userEvent.click(canvas.getByRole('button', { name: 'Open modal' }));
    const modal = canvas.getByRole('dialog');
    await waitFor(() => expect(modal).toBeVisible());
    dismiss.focus();
    await expect(modal.contains(document.activeElement)).toBe(true);
    await userEvent.click(canvas.getByRole('button', { name: 'Close modal' }));
  }
  dismiss.focus();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(toast.matches(':popover-open')).toBe(false));
  await expect(canvasElement.querySelector('[data-toast-dismissals]')).toHaveTextContent('1');
  // Chromium can leave focus in a leaving manual popover; its caller restores the opener.
  await waitFor(() => expect(opener).toHaveFocus());
};

export const Status: Story = { play: ({ canvasElement }) => openAndEscape(canvasElement) };
export const Alert: Story = { args: { tone: 'alert' }, play: ({ canvasElement }) => openAndEscape(canvasElement) };
export const WithUndo: Story = { args: { withUndo: true }, play: ({ canvasElement }) => openAndEscape(canvasElement) };
export const OverOpenMenu: Story = { args: { withUndo: true }, play: ({ canvasElement }) => openAndEscape(canvasElement, 'menu') };
export const UnderModal: Story = { args: { withUndo: true }, play: ({ canvasElement }) => openAndEscape(canvasElement, 'modal') };
// Slice 78: a failure's raw reason waits under a collapsed Details inside the toast.
export const AlertWithDetails: Story = {
  args: { tone: 'alert', detail: 'Section "section-notes" is locked by another change.' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Show feedback' }));
    const details = canvasElement.querySelector<HTMLDetailsElement>('[data-toast] details')!;
    await waitFor(() => expect(details).toBeVisible());
    await expect(details.open).toBe(false);
    await userEvent.click(canvas.getByText('Details'));
    await expect(details).toHaveTextContent('locked by another change');
    await openAndEscape(canvasElement);
  },
};
