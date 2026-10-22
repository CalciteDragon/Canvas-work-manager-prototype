import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProjectSectionSchema } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../../core/gateway/testing/fake-gateway';
import { ProgressSection } from './progress-section';
import { ProgressStore } from './progress-store';
import { SECTION_FRAME_NAME } from '../section-frame-name';

const section = ProjectSectionSchema.parse({ id: 'section-progress', projectId: 'project-a', pageId: 'page-project-a', type: 'progress', position: 0, columnSpan: 12, collapsed: false, config: {}, createdAt: '2026-08-30T07:00:00.000Z', updatedAt: '2026-08-30T07:00:00.000Z' });
const settle = async () => { for (let index = 0; index < 5; index += 1) await Promise.resolve(); };

describe('ProgressSection live invalidation', () => {
  it('observes project-data revision only', async () => {
    const gateway = new FakeWorkManagerGateway({ progress: { projectId: section.projectId, formula: 'count', percentage: 50, completed: 1, total: 2, explanation: 'half' } });
    TestBed.configureTestingModule({ providers: [ProgressStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const fixture = TestBed.createComponent(ProgressSection);
    fixture.componentRef.setInput('section', section); fixture.componentRef.setInput('onConfigChange', vi.fn()); fixture.componentRef.setInput('onProjectDataChange', vi.fn()); fixture.componentRef.setInput('projectDataRevision', 0); fixture.componentRef.setInput('projectHierarchyRevision', 0);
    fixture.detectChanges(); await fixture.whenStable(); await settle();
    const before = gateway.calls.filter(({ method }) => method === 'progress.get').length;
    fixture.componentRef.setInput('projectHierarchyRevision', 1); fixture.detectChanges(); await fixture.whenStable(); await settle();
    expect(gateway.calls.filter(({ method }) => method === 'progress.get')).toHaveLength(before);
    fixture.componentRef.setInput('projectDataRevision', 1); fixture.detectChanges(); await fixture.whenStable(); await settle();
    expect(gateway.calls.filter(({ method }) => method === 'progress.get')).toHaveLength(before + 1);
  });

  it('keeps two Progress views over different projects independent', async () => {
    const otherSection = ProjectSectionSchema.parse({ ...section, id: 'section-progress-b', projectId: 'project-b', pageId: 'page-project-b' });
    const get = vi.fn(async (projectId: typeof section.projectId) => ({
      projectId,
      formula: 'count' as const,
      percentage: projectId === section.projectId ? 25 : 75,
      completed: 1,
      total: 4,
      explanation: projectId === section.projectId ? 'first project' : 'second project',
    }));
    const gateway = new FakeWorkManagerGateway();
    Object.assign(gateway.progress, { get });
    TestBed.configureTestingModule({ providers: [ProgressStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });

    const create = (value: typeof section) => {
      const fixture = TestBed.createComponent(ProgressSection);
      fixture.componentRef.setInput('section', value); fixture.componentRef.setInput('onConfigChange', vi.fn()); fixture.componentRef.setInput('onProjectDataChange', vi.fn()); fixture.componentRef.setInput('projectDataRevision', 0); fixture.componentRef.setInput('projectHierarchyRevision', 0);
      fixture.detectChanges();
      return fixture;
    };
    const firstSection = create(section);
    const secondSection = create(otherSection);
    await settle();
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls.map(([projectId]) => projectId)).toEqual([section.projectId, otherSection.projectId]);

    firstSection.componentRef.setInput('projectDataRevision', 1); firstSection.detectChanges();
    await settle();
    expect(get).toHaveBeenCalledTimes(3);
    expect(firstSection.componentInstance.store.result()?.projectId).toBe(section.projectId);
    expect(secondSection.componentInstance.store.result()?.projectId).toBe(otherSection.projectId);
    expect(secondSection.componentInstance.store.result()?.percentage).toBe(75);
  });

  it('keeps the result visible but hides formula controls in read-only mode', async () => {
    const gateway = new FakeWorkManagerGateway({ progress: { projectId: section.projectId, formula: 'count', percentage: 50, completed: 1, total: 2, explanation: 'half' } });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const fixture = TestBed.createComponent(ProgressSection);
    fixture.componentRef.setInput('section', section);
    fixture.componentRef.setInput('onConfigChange', vi.fn());
    fixture.componentRef.setInput('onProjectDataChange', vi.fn());
    fixture.componentRef.setInput('projectDataRevision', 0);
    fixture.componentRef.setInput('projectHierarchyRevision', 0);
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();
    await fixture.whenStable();
    await settle();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.progress-section__summary')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.progress-section__controls')).toBeNull();
    const before = gateway.calls.filter(({ method }) => method === 'projects.update').length;
    await fixture.componentInstance.choose('weighted');
    expect(gateway.calls.filter(({ method }) => method === 'projects.update')).toHaveLength(before);
  });

  // Slice 72 (L5-004, W1-022): the bar is named from what its frame displays, never from the
  // frame's separate Rename tool, and is described by its own summary.
  const renderNamed = async (value: typeof section, frameName?: string) => {
    const gateway = new FakeWorkManagerGateway({ progress: { projectId: value.projectId, formula: 'count', percentage: 50, completed: 1, total: 2, explanation: 'half done' } });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
        ...(frameName === undefined ? [] : [{ provide: SECTION_FRAME_NAME, useValue: signal(frameName) }]),
      ],
    });
    const create = async () => {
      const fixture = TestBed.createComponent(ProgressSection);
      fixture.componentRef.setInput('section', value); fixture.componentRef.setInput('onConfigChange', vi.fn()); fixture.componentRef.setInput('onProjectDataChange', vi.fn()); fixture.componentRef.setInput('projectDataRevision', 0); fixture.componentRef.setInput('projectHierarchyRevision', 0);
      fixture.detectChanges(); await fixture.whenStable(); await settle(); fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    };
    return { create };
  };
  const bar = (element: HTMLElement) => element.querySelector<HTMLElement>('[role="progressbar"]')!;

  it('names the bar from the frame name and describes it by its own summary', async () => {
    const element = await (await renderNamed(section, 'Launch readiness')).create();

    expect(bar(element).getAttribute('aria-label')).toBe('Launch readiness progress');
    const summary = element.querySelector(`#${bar(element).getAttribute('aria-describedby')}`);
    expect(summary?.textContent).toContain('half done');
  });

  it('falls back to the section name, and never doubles "progress" or reads "Rename"', async () => {
    const untitled = await (await renderNamed(section)).create();
    expect(bar(untitled).getAttribute('aria-label')).toBe('Progress');

    const titled = await (await renderNamed(ProjectSectionSchema.parse({ ...section, title: 'Q3 goals' }))).create();
    expect(bar(titled).getAttribute('aria-label')).toBe('Q3 goals progress');

    const shortcut = await (await renderNamed(section, 'Progress (Kitchen)')).create();
    expect(bar(shortcut).getAttribute('aria-label')).toBe('Progress (Kitchen)');
    for (const element of [untitled, titled, shortcut]) expect(bar(element).getAttribute('aria-label')).not.toContain('Rename');
  });

  it('gives two bars over the same source distinct described-by targets', async () => {
    const { create } = await renderNamed(section, 'Progress');
    const [first, second] = [await create(), await create()];

    expect(bar(first).getAttribute('aria-describedby')).toBeTruthy();
    expect(bar(first).getAttribute('aria-describedby')).not.toBe(bar(second).getAttribute('aria-describedby'));
  });
});


it('emphasises only the active formula without a lone primary (slice 77)', async () => {
 TestBed.configureTestingModule({providers:[{provide:WORK_MANAGER_GATEWAY,useValue:new FakeWorkManagerGateway({progress:{projectId:section.projectId,formula:'count',percentage:50,completed:1,total:2,explanation:'half'}})}]});
 const fixture=TestBed.createComponent(ProgressSection);
 fixture.componentRef.setInput('section',section);fixture.componentRef.setInput('onConfigChange',vi.fn());fixture.componentRef.setInput('onProjectDataChange',vi.fn());fixture.componentRef.setInput('projectDataRevision',0);fixture.componentRef.setInput('projectHierarchyRevision',0);
 await fixture.whenStable();fixture.detectChanges();
 expect(fixture.nativeElement.querySelector('.button--primary')).toBeNull();
 expect(fixture.nativeElement.querySelector('[aria-pressed="true"]')?.classList.contains('progress-section__choice--active')).toBe(true);
});
