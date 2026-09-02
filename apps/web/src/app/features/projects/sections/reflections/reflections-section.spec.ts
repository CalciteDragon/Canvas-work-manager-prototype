import { TestBed } from '@angular/core/testing';
import {
  ProjectSectionSchema,
  ReflectionSchema,
  type ProjectSection,
  type Reflection,
  type SectionConfig,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../../core/gateway/testing/fake-gateway';
import { ReflectionsSection } from './reflections-section';

const section = (): ProjectSection =>
  ProjectSectionSchema.parse({
    id: 'section-reflections',
    projectId: 'project-a',
    type: 'reflections',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config: {},
    createdAt: '2026-08-20T16:00:00.000Z',
    updatedAt: '2026-08-20T16:00:00.000Z',
  });

const reflection = (overrides: Record<string, unknown> = {}): Reflection =>
  ReflectionSchema.parse({
    id: 'reflection-a',
    projectId: 'project-a',
    sectionId: 'section-reflections',
    title: 'Retrospective',
    body: 'We simplified the flow.',
    prompt: 'What went well?',
    createdAt: '2026-08-26T16:00:00.000Z',
    updatedAt: '2026-08-27T16:00:00.000Z',
    ...overrides,
  });

const render = async (gateway = new FakeWorkManagerGateway({ reflections: [reflection()] })) => {
  TestBed.configureTestingModule({
    providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
  });
  const onConfigChange = vi.fn<(config: SectionConfig) => void>();
  const onProjectDataChange = vi.fn<() => void>();
  const onProjectHierarchyChange = vi.fn<() => void>();
  const fixture = TestBed.createComponent(ReflectionsSection);
  fixture.componentRef.setInput('section', section());
  fixture.componentRef.setInput('onConfigChange', onConfigChange);
  fixture.componentRef.setInput('onProjectDataChange', onProjectDataChange);
  fixture.componentRef.setInput('onProjectHierarchyChange', onProjectHierarchyChange);
  fixture.componentRef.setInput('projectDataRevision', 0);
  fixture.componentRef.setInput('projectHierarchyRevision', 0);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, gateway, onConfigChange, onProjectDataChange, onProjectHierarchyChange };
};

const query = (fixture: Awaited<ReturnType<typeof render>>['fixture'], selector: string) =>
  fixture.nativeElement.querySelector(selector) as HTMLElement | null;

describe('ReflectionsSection (§36)', () => {
  it('offers the exact optional prompts and renders chronology with created/updated timestamps', async () => {
    const older = reflection({
      id: 'reflection-old',
      title: undefined,
      prompt: undefined,
      createdAt: '2026-08-24T16:00:00.000Z',
      updatedAt: '2026-08-24T16:00:00.000Z',
    });
    const { fixture } = await render(new FakeWorkManagerGateway({ reflections: [older, reflection()] }));

    const options = [...fixture.nativeElement.querySelectorAll('[data-reflection-prompt] option')].map(
      (option: HTMLOptionElement) => option.textContent?.trim(),
    );
    expect(options).toEqual([
      'No prompt',
      'What changed?',
      'What went well?',
      "What's blocked?",
      'What should happen next?',
    ]);
    const entries = fixture.nativeElement.querySelectorAll('[data-reflection-entry]');
    expect(entries).toHaveLength(2);
    expect(entries[0].textContent).toContain('Retrospective');
    expect(entries[0].querySelector('[data-reflection-created]')?.getAttribute('datetime')).toBe(
      '2026-08-26T16:00:00.000Z',
    );
    expect(entries[0].querySelector('[data-reflection-updated]')?.getAttribute('datetime')).toBe(
      '2026-08-27T16:00:00.000Z',
    );
    expect(entries[1].querySelector('[data-reflection-updated]')).toBeNull();
  });

  it('creates a prompted titled reflection, clears the composer, and never refreshes project progress', async () => {
    const { fixture, gateway, onConfigChange, onProjectDataChange } = await render(
      new FakeWorkManagerGateway({ reflections: [] }),
    );
    const title = query(fixture, '[data-reflection-title]') as HTMLInputElement;
    const body = query(fixture, '[data-reflection-body]') as HTMLTextAreaElement;
    const prompt = query(fixture, '[data-reflection-prompt]') as HTMLSelectElement;
    title.value = '  Weekly note  ';
    body.value = '  Momentum improved.  ';
    prompt.value = 'What changed?';

    query(fixture, '[data-reflection-create]')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(gateway.argumentTo('reflections.create')).toEqual({
      projectId: 'project-a',
      sectionId: section().id,
      title: 'Weekly note',
      body: 'Momentum improved.',
      prompt: 'What changed?',
    });
    expect(title.value).toBe('');
    expect(body.value).toBe('');
    expect(prompt.value).toBe('');
    expect(onConfigChange).not.toHaveBeenCalled();
    expect(onProjectDataChange).toHaveBeenCalledOnce();
  });

  it('re-reads on data revision but ignores hierarchy-only revision', async () => {
    const { fixture, gateway } = await render();
    const before = gateway.calls.filter(({ method }) => method === 'reflections.list').length;
    fixture.componentRef.setInput('projectHierarchyRevision', 1); fixture.detectChanges(); await fixture.whenStable();
    expect(gateway.calls.filter(({ method }) => method === 'reflections.list')).toHaveLength(before);
    fixture.componentRef.setInput('projectDataRevision', 1); fixture.detectChanges(); await fixture.whenStable();
    expect(gateway.calls.filter(({ method }) => method === 'reflections.list')).toHaveLength(before + 1);
  });

  it('supports edit, cancel, and save for title and body', async () => {
    const { fixture, gateway } = await render();

    query(fixture, '[data-reflection-edit]')!.click();
    fixture.detectChanges();
    expect(query(fixture, '[data-reflection-edit-form]')).not.toBeNull();
    query(fixture, '[data-reflection-cancel]')!.click();
    fixture.detectChanges();
    expect(query(fixture, '[data-reflection-edit-form]')).toBeNull();

    query(fixture, '[data-reflection-edit]')!.click();
    fixture.detectChanges();
    const title = query(fixture, '[data-reflection-edit-title]') as HTMLInputElement;
    const body = query(fixture, '[data-reflection-edit-body]') as HTMLTextAreaElement;
    title.value = '  Revised title  ';
    body.value = '  Revised body  ';
    query(fixture, '[data-reflection-edit-form]')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.argumentTo('reflections.update')).toEqual({
      id: 'reflection-a',
      input: { title: 'Revised title', body: 'Revised body' },
    });
    expect(query(fixture, '[data-reflection-edit-form]')).toBeNull();
    expect(query(fixture, '[data-reflection-entry]')?.textContent).toContain('Revised body');
  });

  it('renders empty, pending, and failure states visibly', async () => {
    const empty = await render(new FakeWorkManagerGateway({ reflections: [] }));
    expect(query(empty.fixture, '[data-reflections-empty]')).not.toBeNull();

    TestBed.resetTestingModule();
    const failed = await render(
      new FakeWorkManagerGateway({
        failWith: new GatewayError('unreachable', 0, 'could not load reflections'),
      }),
    );
    expect(query(failed.fixture, '[data-reflections-error]')?.textContent).toContain(
      'could not load reflections',
    );
    expect(query(failed.fixture, '[data-reflections-pending]')).toBeNull();
  });
});
