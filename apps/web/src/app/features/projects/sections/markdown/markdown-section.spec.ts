import { By } from '@angular/platform-browser';
import { DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { ProjectSectionSchema } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownSection } from './markdown-section';
import { MarkdownSectionBody } from './markdown-section-body';

const render = (config: unknown) => {
  TestBed.configureTestingModule({ deferBlockBehavior: DeferBlockBehavior.Manual });
  const fixture = TestBed.createComponent(MarkdownSection);
  const save = vi.fn(async () => true);
  fixture.componentRef.setInput('section', ProjectSectionSchema.parse({
    id: 'section-a', projectId: 'project-a', pageId: 'page-a', type: 'markdown',
    config, position: 0, columnSpan: 12, collapsed: false,
    createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-01T12:00:00.000Z',
  }));
  fixture.componentRef.setInput('onConfigChange', save);
  fixture.detectChanges();
  return { fixture, save };
};

describe('MarkdownSection lazy shell', () => {
  it('placeholder shows plain source, then the body renders', async () => {
    const { fixture } = render({ markdown: '# Plan\n<script>source</script>' });
    const placeholder = fixture.nativeElement.querySelector('.markdown-placeholder') as HTMLElement;
    expect(placeholder?.textContent).toBe('# Plan\n<script>source</script>');
    expect(placeholder?.style.whiteSpace).toBe('pre-wrap');
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
    expect(fixture.nativeElement.querySelector('h3')).toBeNull();
    const [block] = await fixture.getDeferBlocks();
    await block!.render(DeferBlockState.Complete);
    expect(fixture.nativeElement.querySelector('h3')?.textContent).toBe('Plan');
  });
  it('passes onConfigChange through as save', async () => {
    const { fixture, save } = render({ markdown: '# Plan' });
    const [block] = await fixture.getDeferBlocks();
    await block!.render(DeferBlockState.Complete);
    expect(fixture.debugElement.query(By.directive(MarkdownSectionBody)).componentInstance.save()).toBe(save);
  });
  it('empty and unreadable configs have an empty placeholder', () => {
    const { fixture } = render({ text: 'keep this' });
    expect(fixture.nativeElement.querySelector('.markdown-placeholder')?.textContent).toBe('');
    fixture.componentRef.setInput('section', { ...fixture.componentInstance.section(), config: {} });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.markdown-placeholder')?.textContent).toBe('');
  });
});
