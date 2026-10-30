import { TestBed } from '@angular/core/testing';
import { ProjectSchema } from '@cwm/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDetailsDialog } from './project-details-dialog';

const originals = ['showModal', 'close'].map((key) => ({ key, descriptor: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, key) }));
afterEach(() => {
  TestBed.resetTestingModule();
  for (const { key, descriptor } of originals) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  }
});
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
});

const render = async () => {
  const fixture = TestBed.createComponent(ProjectDetailsDialog);
  fixture.componentRef.setInput('project', ProjectSchema.parse({
    id: 'project-a', workspaceId: 'workspace-demo', kind: 'root', name: 'Kitchen', status: 'active',
    projectLayoutMode: 'flow', createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:00:00.000Z',
  }));
  fixture.componentRef.setInput('opener', document.createElement('button'));
  const save = vi.fn().mockResolvedValue(true);
  fixture.componentRef.setInput('save', save);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, save };
};

describe('ProjectDetailsDialog — one commit (§26)', () => {
  it('closes an unchanged draft without a request', async () => {
    const { fixture, save } = await render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    await fixture.componentInstance.submit(new Event('submit'));
    expect(save).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledOnce();
  });

  it('sends only changed fields and preserves the draft after a refusal', async () => {
    const { fixture, save } = await render();
    save.mockResolvedValue(false);
    fixture.componentInstance.name.set('Refit');
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    await fixture.componentInstance.submit(new Event('submit'));
    expect(save).toHaveBeenCalledExactlyOnceWith({ name: 'Refit' });
    expect(closed).not.toHaveBeenCalled();
    expect(fixture.componentInstance.name()).toBe('Refit');
    expect(fixture.componentInstance.failed()).toBe(true);
  });
});

describe('ProjectDetailsDialog — failures (Slice 78, §24, §63)', () => {
  const failureOf = (fixture: Awaited<ReturnType<typeof render>>['fixture']) => {
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const wrapper = element.querySelector<HTMLElement>('[data-project-details-error]')!;
    return { element, wrapper, sentence: wrapper.querySelector<HTMLElement>('[data-failure-sentence]')! };
  };

  it('refuses a blank name with a sentence, no Details, named by the name field', async () => {
    const { fixture, save } = await render();
    fixture.componentInstance.name.set('  ');
    await fixture.componentInstance.submit(new Event('submit'));
    const { element, wrapper, sentence } = failureOf(fixture);
    expect(save).not.toHaveBeenCalled();
    expect(sentence.textContent?.trim()).toBe('A project name is required.');
    expect(sentence.getAttribute('role')).toBe('alert');
    expect(wrapper.querySelector('details')).toBeNull();
    const name = element.querySelector<HTMLInputElement>('[data-project-rename-input]')!;
    expect(document.getElementById(name.getAttribute('aria-describedby')!)).toBe(sentence);
  });

  it('shows the header’s write failure as its sentence with the reason under Details, named by Save', async () => {
    const { fixture, save } = await render();
    save.mockResolvedValue(false);
    fixture.componentRef.setInput('writeError', { sentence: 'Couldn’t rename “Kitchen”. Try again.', reason: 'host stopped' });
    fixture.componentInstance.name.set('Refit');
    await fixture.componentInstance.submit(new Event('submit'));
    const { element, wrapper, sentence } = failureOf(fixture);
    expect(sentence.textContent?.trim()).toBe('Couldn’t rename “Kitchen”. Try again.');
    expect(wrapper.querySelector('details')?.open).toBe(false);
    expect(wrapper.querySelector('details')?.textContent).toContain('host stopped');
    const saveButton = element.querySelector<HTMLElement>('[data-project-details-save]')!;
    expect(document.getElementById(saveButton.getAttribute('aria-describedby')!)).toBe(sentence);
    expect(element.querySelector('[data-project-rename-input]')?.getAttribute('aria-describedby')).toBeNull();
  });

  it('turns a thrown save into the details sentence with the reason under Details', async () => {
    const { fixture, save } = await render();
    save.mockRejectedValue(new Error('socket closed'));
    fixture.componentInstance.description.set('New');
    await fixture.componentInstance.submit(new Event('submit'));
    const { wrapper, sentence } = failureOf(fixture);
    expect(sentence.textContent?.trim()).toBe('Couldn’t save the details of “Kitchen”. Try again.');
    expect(wrapper.querySelector('details')?.textContent).toContain('socket closed');
  });
});
