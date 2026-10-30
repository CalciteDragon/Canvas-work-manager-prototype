import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ReflectionComposer } from './reflection-composer';

const subject = {
  kind: 'task' as const,
  id: 'task-release',
  name: 'Ship the release',
  status: 'done' as const,
  completedAt: '2026-09-05T10:00:00.000Z',
  archived: false,
  hiddenByArchivedAncestor: false,
  breadcrumb: [{ projectId: 'project-root', name: 'Product launch' }],
};

const render = async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(ReflectionComposer);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, composer: fixture.componentInstance };
};

describe('ReflectionComposer (§36)', () => {
  it('emits a draft and preserves the armed subject as presentational state', async () => {
    const { fixture, composer } = await render();
    fixture.componentRef.setInput('subject', subject);
    fixture.detectChanges();
    const submitted = vi.fn();
    composer.submitted.subscribe(submitted);

    const title = fixture.nativeElement.querySelector('[data-reflection-title]') as HTMLInputElement;
    const body = fixture.nativeElement.querySelector('[data-reflection-body]') as HTMLTextAreaElement;
    const prompt = fixture.nativeElement.querySelector('[data-reflection-prompt]') as HTMLSelectElement;
    title.value = '  Launch checkpoint  ';
    body.value = '  The handoff was smooth.  ';
    prompt.value = 'What changed?';
    fixture.nativeElement.querySelector('[data-reflection-create]')!.dispatchEvent(new Event('submit'));

    expect(submitted).toHaveBeenCalledWith({
      title: '  Launch checkpoint  ',
      body: '  The handoff was smooth.  ',
      prompt: 'What changed?',
    });
    expect(fixture.nativeElement.querySelector('[data-reflection-subject]')?.textContent).toContain('Ship the release');
  });

  // Slice 72 (L5-003): the prompt select has a visible label, not only its first option.
  it('labels the prompt select with a visible "Prompt" control label', async () => {
    const { fixture } = await render();
    const prompt = fixture.nativeElement.querySelector('[data-reflection-prompt]') as HTMLSelectElement;

    expect(prompt.labels?.[0]?.textContent?.trim()).toBe('Prompt');
    expect(prompt.labels?.[0]?.classList).toContain('control-label');
  });

  it('emits subject removal and can clear all form controls', async () => {
    const { fixture, composer } = await render();
    fixture.componentRef.setInput('subject', subject);
    fixture.detectChanges();
    const removed = vi.fn();
    composer.subjectRemoved.subscribe(removed);
    fixture.nativeElement.querySelector('[data-reflection-subject-remove]')!.click();
    expect(removed).toHaveBeenCalledOnce();

    const title = fixture.nativeElement.querySelector('[data-reflection-title]') as HTMLInputElement;
    const body = fixture.nativeElement.querySelector('[data-reflection-body]') as HTMLTextAreaElement;
    title.value = 'Title';
    body.value = 'Body';
    composer.clear();
    expect(title.value).toBe('');
    expect(body.value).toBe('');
  });

  it('hides the form in read-only mode and shows the owner-supplied error', async () => {
    const { fixture } = await render();
    fixture.componentRef.setInput('readOnly', true);
    fixture.componentRef.setInput('error', { sentence: 'Couldn’t add your reflection. Try again.', reason: 'The journal could not be saved.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-reflection-create]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-reflection-compose-error] details')?.textContent).toContain(
      'The journal could not be saved.',
    );
  });

  it('describes the body by the failure’s sentence alone, the reason under Details (Slice 78)', async () => {
    const { fixture } = await render();
    fixture.componentRef.setInput('error', { sentence: 'Couldn’t add your reflection. Try again.', reason: 'offline' });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const sentence = element.querySelector<HTMLElement>('[data-reflection-compose-error] [data-failure-sentence]')!;
    expect(sentence.getAttribute('role')).toBe('alert');
    expect(element.querySelector('[data-reflection-body]')?.getAttribute('aria-describedby')).toBe(sentence.id);
    expect(sentence.textContent?.trim()).toBe('Couldn’t add your reflection. Try again.');
    expect(element.querySelector<HTMLDetailsElement>('[data-reflection-compose-error] details')?.open).toBe(false);
  });
});
