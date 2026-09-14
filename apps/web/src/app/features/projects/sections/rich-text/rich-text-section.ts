import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { nameOf, type ProjectSection, type SectionConfig } from '@cwm/contracts';
import { readRichTextConfig } from './rich-text-config';

/**
 * §30's Rich Text section. Plain text in a content-sized textarea: a formatting toolbar is
 * not a question this prototype has to answer, and the §83 question the section exists to test
 * is whether free-form notes belong on a project canvas at all.
 *
 * The height follows the wrapped text in script, not through CSS `field-sizing: content`,
 * which only Chromium implements. It is refitted on typing, when the saved text changes, and
 * when the editor's width changes — a narrower Flow span wraps more lines with no input event.
 */
@Component({
  selector: 'app-rich-text-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rich-text-section.html',
  styleUrl: './rich-text-section.scss',
})
export class RichTextSection {
  readonly section = input.required<ProjectSection>();
  readonly onConfigChange = input.required<(config: SectionConfig) => void>();
  readonly onProjectDataChange = input.required<() => void>();
  readonly onProjectHierarchyChange = input.required<() => void>();
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();
  readonly readOnly = input(false);

  readonly text = computed(() => readRichTextConfig(this.section().config).text);

  /** A template can only call its component's members, and the label needs the shared name. */
  readonly name = computed(() => nameOf(this.section()));

  private readonly body = viewChild.required<ElementRef<HTMLTextAreaElement>>('body');

  constructor() {
    afterRenderEffect(() => {
      this.text();
      this.fit();
    });

    // jsdom and very old engines lack ResizeObserver; typing still refits there.
    if (typeof ResizeObserver === 'undefined') return;
    let observedWidth: number | null = null;
    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      const width = this.body().nativeElement.clientWidth;
      // Setting the height notifies the observer too; only a width change can rewrap text.
      if (width === observedWidth) return;
      observedWidth = width;
      // Resizing inside the callback would make the browser report a ResizeObserver loop.
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        this.fit();
      });
    });
    afterRenderEffect(() => observer.observe(this.body().nativeElement));
    inject(DestroyRef).onDestroy(() => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    });
  }

  /** Grow or shrink to the content, keeping the `rows` minimum that `height: auto` yields. */
  fit(): void {
    const textarea = this.body().nativeElement;
    textarea.style.height = 'auto';
    const borders = textarea.offsetHeight - textarea.clientHeight;
    textarea.style.height = `${textarea.scrollHeight + borders}px`;
  }

  /**
   * Saved on blur, not per keystroke: the section has no other commit point, and a debounce
   * would still PATCH mid-sentence.
   */
  save(value: string): void {
    if (this.readOnly()) return;
    if (value === this.text()) return;
    this.onConfigChange()({ text: value });
  }
}
