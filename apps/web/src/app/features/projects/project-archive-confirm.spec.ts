import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
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

const workstream = (id: string, name: string, status: string) => ProjectSchema.parse({
  id, workspaceId: 'workspace-demo', kind: 'subproject', parentProjectId: 'project-a', name, status,
  projectLayoutMode: 'flow', createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:00:00.000Z',
});

const render = async (liveChildren?: ReturnType<typeof workstream>[]) => {
  TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
  const fixture = TestBed.createComponent(ProjectArchiveConfirm);
  fixture.componentRef.setInput('project', ProjectSchema.parse({
    id: 'project-a', workspaceId: 'workspace-demo', kind: 'root', name: 'Kitchen', status: 'active',
    projectLayoutMode: 'flow', createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:00:00.000Z',
  }));
  fixture.componentRef.setInput('opener', document.createElement('button'));
  const archive = vi.fn().mockResolvedValue(true);
  fixture.componentRef.setInput('archive', archive);
  if (liveChildren) fixture.componentRef.setInput('liveChildren', liveChildren);
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

  it('keeps the commit form when nothing live is under the project', async () => {
    const { fixture } = await render([]);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h2')?.textContent).toBe('Archive “Kitchen”?');
    expect(element.querySelector('[data-project-archive-confirm-yes]')).not.toBeNull();
    expect(element.querySelector('[data-project-archive-child]')).toBeNull();
  });

  // Slice 79, L4-008: the domain's rule said before the write, never after it.
  it('blocks the archive while workstreams are live: each one a link with its status, and Close only', async () => {
    const { fixture, archive } = await render([workstream('project-c', 'Cabinets', 'active'), workstream('project-g', 'Garden', 'completed')]);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-project-archive-confirm]')).not.toBeNull();
    expect(element.querySelector('h2')?.textContent).toBe('“Kitchen” can’t be archived yet');
    expect(element.querySelector('p')?.textContent).toBe('These workstreams aren’t archived. Archive them first:');
    expect(element.querySelector('[data-project-archive-confirm-yes]')).toBeNull();
    const links = [...element.querySelectorAll<HTMLAnchorElement>('a[data-project-archive-child]')];
    // Each is a target, not bare running text: the link primitive's 24 px, 44 px under a coarse pointer.
    for (const link of links) expect(link.classList).toContain('link');
    expect(links.map((link) => [link.getAttribute('href'), link.closest('li')?.textContent?.trim()])).toEqual([
      ['/projects/project-c', 'Cabinets · Active'],
      ['/projects/project-g', 'Garden · Completed'],
    ]);
    const buttons = [...element.querySelectorAll('button')];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['Close']);
    expect(document.activeElement).toBe(buttons[0]);

    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    links[1]!.click();
    await fixture.whenStable();
    expect(closed).toHaveBeenCalledOnce();
    expect(archive).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe('/projects/project-g');
  });

  // A live frame can change the tree while the dialog is open; focus must not fall out of it.
  it('keeps focus on its one dismiss button when the form changes while open', async () => {
    const { fixture } = await render([]);
    const element = fixture.nativeElement as HTMLElement;
    expect(document.activeElement?.textContent?.trim()).toBe('Cancel');
    fixture.componentRef.setInput('liveChildren', [workstream('project-c', 'Cabinets', 'on_hold')]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector('li')?.textContent?.trim()).toBe('Cabinets · On hold');
    expect(document.activeElement).toBe(element.querySelector('[data-project-archive-cancel]'));
    expect(document.activeElement?.textContent?.trim()).toBe('Close');
  });
});
