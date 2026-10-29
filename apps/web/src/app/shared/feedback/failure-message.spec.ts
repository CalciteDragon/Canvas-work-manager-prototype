import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { Failure } from './failure';
import { FailureMessage } from './failure-message';

const FAILURE: Failure = { sentence: 'Couldn’t load this task list.', reason: 'Task list "section-1" was not found.' };

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FailureMessage],
  template: `
    <button type="button" aria-describedby="row-failure">Complete</button>
    <app-failure-message data-tasks-error [failure]="failure()" [weight]="weight()" [live]="live()"
      [recovery]="recovery()" [pending]="pending()" sentenceId="row-failure" (retry)="retried()" />
  `,
})
class Host {
  readonly failure = signal<Failure>(FAILURE);
  readonly weight = signal<'region' | 'inline'>('region');
  readonly live = signal<'alert' | 'status' | null>('alert');
  readonly recovery = signal<'try-again' | 'retry-refresh' | null>('try-again');
  readonly pending = signal(false);
  readonly retried = vi.fn();
}

const setup = () => {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const wrapper = () => element.querySelector<HTMLElement>('[data-tasks-error]')!;
  const sentence = () => wrapper().querySelector<HTMLElement>('[data-failure-sentence]')!;
  const details = () => wrapper().querySelector<HTMLDetailsElement>('details');
  const button = () => wrapper().querySelector<HTMLButtonElement>('button[data-recovery]');
  return { fixture, host: fixture.componentInstance, element, wrapper, sentence, details, button };
};

describe('FailureMessage (Slice 78, §21, §24)', () => {
  it('renders the region weight with the sentence as an alert, Try again and a closed Details', () => {
    const { wrapper, sentence, details, button, host } = setup();
    expect(wrapper().classList).toContain('state-message');
    expect(wrapper().classList).toContain('state-message--failed');
    expect(wrapper().classList).toContain('state-message--region');
    expect(sentence().getAttribute('role')).toBe('alert');
    expect(sentence().textContent?.trim()).toBe(FAILURE.sentence);
    expect(button()?.textContent?.trim()).toBe('Try again');
    expect(button()?.getAttribute('data-recovery')).toBe('try-again');
    button()!.click();
    expect(host.retried).toHaveBeenCalledOnce();
    expect(details()?.open).toBe(false);
    expect(details()?.querySelector('summary')?.textContent?.trim()).toBe('Details');
    expect(details()?.textContent).toContain(FAILURE.reason);
    expect(details()?.parentElement).toBe(sentence().parentElement);
  });

  it('keeps the reason in the wrapper and out of the described sentence', () => {
    const { element, wrapper, sentence } = setup();
    expect(wrapper().textContent).toContain(FAILURE.reason);
    const described = element.querySelector(`#${element.querySelector('button[aria-describedby]')!.getAttribute('aria-describedby')}`);
    expect(described).toBe(sentence());
    expect(described?.textContent).not.toContain(FAILURE.reason);
  });

  it('has no Details when there is no reason, and no button without a recovery', () => {
    const { fixture, host, details, button } = setup();
    host.failure.set({ sentence: 'Couldn’t write today’s digest.', reason: null });
    host.recovery.set(null);
    fixture.detectChanges();
    expect(details()).toBeNull();
    expect(button()).toBeNull();
  });

  it('announces politely or not at all, and names Retry refresh when asked', () => {
    const { fixture, host, sentence, button } = setup();
    host.live.set('status');
    host.recovery.set('retry-refresh');
    fixture.detectChanges();
    expect(sentence().getAttribute('role')).toBe('status');
    expect(button()?.textContent?.trim()).toBe('Retry refresh');
    expect(button()?.getAttribute('data-recovery')).toBe('retry-refresh');
    host.live.set(null);
    fixture.detectChanges();
    expect(sentence().hasAttribute('role')).toBe(false);
  });

  it('renders the inline weight in the slice-75 failed tone', () => {
    const { fixture, host, wrapper, sentence } = setup();
    host.weight.set('inline');
    fixture.detectChanges();
    expect(wrapper().classList).toContain('state-message--inline');
    expect(wrapper().classList).not.toContain('state-message--region');
    expect(sentence().classList).toContain('field-status--failed');
  });

  it('is busy while its retry runs, with Try again disabled', () => {
    const { fixture, host, wrapper, button } = setup();
    expect(wrapper().hasAttribute('aria-busy')).toBe(false);
    host.pending.set(true);
    fixture.detectChanges();
    expect(wrapper().getAttribute('aria-busy')).toBe('true');
    expect(button()?.disabled).toBe(true);
    button()!.click();
    expect(host.retried).not.toHaveBeenCalled();
  });
});
