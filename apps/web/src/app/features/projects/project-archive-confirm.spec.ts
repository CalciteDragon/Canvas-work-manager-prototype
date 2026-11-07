import { TestBed } from '@angular/core/testing';
import { ProjectSchema } from '@cwm/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveDescendant } from './live-descendants';
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

const node = (id: string, name: string, status: string, children: LiveDescendant[] = []): LiveDescendant => ({
  project: ProjectSchema.parse({
    id, workspaceId: 'workspace-demo', kind: 'subproject', parentProjectId: 'project-a', name, status,
    projectLayoutMode: 'flow', createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:00:00.000Z',
  }),
  children,
});
const GROUP = () => [node('project-k', 'Kitchen', 'active', [node('project-c', 'Cabinets', 'on_hold')]), node('project-g', 'Garden', 'completed')];

const render = async (workstreams?: LiveDescendant[]) => {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(ProjectArchiveConfirm);
  fixture.componentRef.setInput('project', ProjectSchema.parse({
    id: 'project-a', workspaceId: 'workspace-demo', kind: 'root', name: 'Home renovation', status: 'active',
    projectLayoutMode: 'flow', createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:00:00.000Z',
  }));
  const opener = document.createElement('button');
  document.body.append(opener);
  fixture.componentRef.setInput('opener', opener);
  const archive = vi.fn().mockResolvedValue(true);
  fixture.componentRef.setInput('archive', archive);
  if (workstreams) fixture.componentRef.setInput('workstreams', workstreams);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, archive, opener, element: fixture.nativeElement as HTMLElement };
};
const cancelButton = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-project-archive-cancel]');

describe('ProjectArchiveConfirm (§26, Slice 80)', () => {
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

  it('keeps today’s words with nothing live under the project', async () => {
    const { fixture, archive, element } = await render([]);
    expect(element.querySelector('h2')?.textContent).toBe('Archive “Home renovation”?');
    expect(element.querySelector('p')?.textContent).toBe('It leaves the sidebar; you can undo it from the header.');
    expect(element.querySelector('[data-project-archive-confirm-yes]')?.textContent?.trim()).toBe('Archive it');
    expect(element.querySelector('[data-project-archive-list]')).toBeNull();
    await fixture.componentInstance.confirm();
    expect(archive).toHaveBeenCalledWith([]);
  });

  it('with a list, shows the count, the statuses and nested depth, and is static text', async () => {
    const { element } = await render(GROUP());
    expect(element.querySelector('h2')?.textContent).toBe('Archive “Home renovation” and its 3 workstreams?');
    expect(element.querySelector('p')?.textContent).toBe('They leave the sidebar together. You can undo it from the header, and restoring “Home renovation” brings these back:');
    const rows = [...element.querySelectorAll<HTMLElement>('[data-project-archive-row]')];
    expect(rows.map((row) => row.querySelector('span')?.textContent?.trim())).toEqual(['Kitchen · Active', 'Cabinets · On hold', 'Garden · Completed']);
    // Depth reaches assistive technology, not only the eye.
    expect(rows[1]!.parentElement?.closest('li')).toBe(rows[0]);
    expect(element.querySelector('a')).toBeNull();
    expect(element.querySelector('[data-project-archive-confirm-yes]')?.textContent?.trim()).toBe('Archive all');
  });

  it('says one workstream in the singular', async () => {
    const { element } = await render([node('project-c', 'Cabinets', 'active')]);
    expect(element.querySelector('h2')?.textContent).toBe('Archive “Home renovation” and its 1 workstream?');
  });

  it('the press sends the ids on screen, depth first', async () => {
    const { fixture, archive } = await render(GROUP());
    await fixture.componentInstance.confirm();
    expect(archive).toHaveBeenCalledExactlyOnceWith(['project-k', 'project-c', 'project-g']);
  });

  it('a frame while open updates the list and the ids together', async () => {
    const { fixture, archive, element } = await render(GROUP());
    fixture.componentRef.setInput('workstreams', [...GROUP(), node('project-n', 'New', 'planning')]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector('h2')?.textContent).toContain('its 4 workstreams');
    await fixture.componentInstance.confirm();
    expect(archive).toHaveBeenCalledWith(['project-k', 'project-c', 'project-g', 'project-n']);
  });

  it('starts focus on Cancel, and moves it there when a frame empties the list while it is in the region', async () => {
    const { fixture, element } = await render(GROUP());
    expect(document.activeElement).toBe(cancelButton(element));
    element.querySelector<HTMLElement>('[data-project-archive-list]')!.focus();
    expect(document.activeElement).toBe(element.querySelector('[data-project-archive-list]'));

    fixture.componentRef.setInput('workstreams', []);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(element.querySelector('[data-project-archive-list]')).toBeNull();
    expect(document.activeElement).toBe(cancelButton(element));
  });

  it('moves focus to Cancel when a list appears, off a button that has just become Archive all', async () => {
    const { fixture, element } = await render([]);
    element.querySelector<HTMLElement>('[data-project-archive-confirm-yes]')!.focus();

    fixture.componentRef.setInput('workstreams', GROUP());
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(cancelButton(element));
  });

  it('holds a long list in its own named, focusable region', async () => {
    const { element } = await render(Array.from({ length: 20 }, (_, i) => node(`project-${i}`, `Workstream ${i}`, 'active')));
    const region = element.querySelector<HTMLElement>('[data-project-archive-list]')!;
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-label')).toBe('Workstreams to archive');
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(element.querySelector('h2')?.closest('[data-project-archive-list]')).toBeNull();
    expect(element.querySelector('[data-project-archive-confirm-yes]')?.closest('[data-project-archive-list]')).toBeNull();
  });

  it.each([
    ['Escape', (fixture: Awaited<ReturnType<typeof render>>['fixture']) => fixture.componentInstance.keydown(new KeyboardEvent('keydown', { key: 'Escape' }))],
    ['Cancel', (fixture: Awaited<ReturnType<typeof render>>['fixture']) => fixture.componentInstance.close()],
    ['a commit', (fixture: Awaited<ReturnType<typeof render>>['fixture']) => fixture.componentInstance.confirm()],
  ])('%s returns focus to More', async (_name, act) => {
    const { fixture, opener } = await render(GROUP());
    await act(fixture);
    await fixture.whenStable();
    expect(document.activeElement).toBe(opener);
  });

  it('a refusal returns focus to More too', async () => {
    const { fixture, archive, opener } = await render(GROUP());
    archive.mockResolvedValue(false);
    await fixture.componentInstance.confirm();
    expect(document.activeElement).toBe(opener);
  });
});
