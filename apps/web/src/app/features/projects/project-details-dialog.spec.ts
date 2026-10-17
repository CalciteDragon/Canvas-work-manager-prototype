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
