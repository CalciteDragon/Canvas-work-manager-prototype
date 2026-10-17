import { TestBed } from '@angular/core/testing';
import { ProjectSchema } from '@cwm/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectArchiveConfirm } from './project-archive-confirm';

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
  const fixture = TestBed.createComponent(ProjectArchiveConfirm);
  fixture.componentRef.setInput('project', ProjectSchema.parse({
    id: 'project-a', workspaceId: 'workspace-demo', kind: 'root', name: 'Kitchen', status: 'active',
    projectLayoutMode: 'flow', createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:00:00.000Z',
  }));
  fixture.componentRef.setInput('opener', document.createElement('button'));
  const archive = vi.fn().mockResolvedValue(true);
  fixture.componentRef.setInput('archive', archive);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, archive };
};

describe('ProjectArchiveConfirm (§26)', () => {
  it('cancels without a write', async () => {
    const { fixture, archive } = await render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    fixture.componentInstance.close();
    expect(archive).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledOnce();
  });

  it('confirms once and closes after either success or refusal', async () => {
    const { fixture, archive } = await render();
    archive.mockResolvedValue(false);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    await fixture.componentInstance.confirm();
    await fixture.componentInstance.confirm();
    expect(archive).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
  });
});
