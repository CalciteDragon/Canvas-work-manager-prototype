import { ChangeDetectionStrategy, Component, ElementRef, Injector, ViewChild, afterNextRender, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  ProjectId,
  ProjectLayoutMode,
  ProjectPageId,
  ProjectJournalEntry,
  ReflectionSubjectView,
} from '@cwm/contracts';
import { ReflectionComposer, type ReflectionDraft } from '../sections/reflections/reflection-composer';
import { ReflectionsPageStore } from './reflections-page-store';
import { SectionUndoNotice } from '../section-undo-notice';
import type { ProjectPageRenderer } from '../project-page-contract';

const statusLabel = (status: string): string => status.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

/** §36's root-wide Reflections page: one composer, a completed-work picker and the journal feed. */
@Component({
  selector: 'app-reflections-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReflectionComposer, RouterLink, SectionUndoNotice],
  providers: [ReflectionsPageStore],
  templateUrl: './reflections-page.html',
  styleUrl: './reflections-page.scss',
})
export class ReflectionsPage implements ProjectPageRenderer {
  readonly projectId = input.required<ProjectId>();
  readonly pageId = input.required<ProjectPageId>();
  readonly projectLayoutMode = input<ProjectLayoutMode>('flow');
  readonly restoreBlocked = input<boolean>(false);
  readonly shortcutsAllowed = input<boolean>(false);
  readonly onProjectDataChange = input<() => void>(() => {});
  readonly onProjectHierarchyChange = input<() => void>(() => {});
  readonly onOpenArchive = input<() => void>(() => {});

  readonly store = inject(ReflectionsPageStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  readonly selectedSubject = signal<ReflectionSubjectView | null>(null);
  readonly pageWritesBlocked = computed(() => this.restoreBlocked());

  @ViewChild(ReflectionComposer) private composer?: ReflectionComposer;

  constructor() {
    effect(() => void this.store.load(this.projectId(), this.pageId()));
  }

  subjectValue(subject: ReflectionSubjectView): string {
    return `${subject.kind}:${subject.id}`;
  }

  selectSubject(value: string): void {
    if (value === '') {
      this.selectedSubject.set(null);
      return;
    }
    this.selectedSubject.set(
      this.store.candidates().find((candidate) => this.subjectValue(candidate) === value) ?? null,
    );
  }

  subjectLabel(subject: ReflectionSubjectView): string {
    return `${subject.name} · ${subject.kind === 'task' ? 'Task' : 'Unit of work'}`;
  }

  removeSubject(): void {
    this.selectedSubject.set(null);
  }

  async addContainer(): Promise<void> {
    if (this.pageWritesBlocked()) return;
    if (await this.store.ensureContainer()) this.onProjectHierarchyChange()();
  }

  async create(draft: ReflectionDraft): Promise<void> {
    if (this.pageWritesBlocked()) return;
    if (
      await this.store.create(
        draft.body,
        draft.title,
        draft.prompt,
        this.selectedSubject() ?? undefined,
      )
    ) {
      this.composer?.clear();
      this.selectedSubject.set(null);
      this.onProjectDataChange()();
    }
  }

  async undoContainer(): Promise<void> {
    if (this.pageWritesBlocked()) return;
    const result = await this.store.undoOperation();
    if (result !== null) this.onProjectDataChange()();
    // The Undo button leaves with its receipt, so focus would otherwise fall to the body.
    afterNextRender(() => {
      const target = this.host.nativeElement.querySelector<HTMLElement>('[data-undo-action]') ??
        this.host.nativeElement.querySelector<HTMLElement>('[data-undo-notice]') ??
        this.host.nativeElement.querySelector<HTMLElement>('[data-reflections-add-container]');
      target?.focus();
    }, { injector: this.injector });
  }

  focusUndoNotice(): void {
    if (document.activeElement !== document.body && document.activeElement !== null) return;
    this.host.nativeElement.querySelector<HTMLButtonElement>('[data-undo-action]')?.focus();
  }

  titleOf(entry: ProjectJournalEntry): string {
    return entry.reflection.title ?? 'Reflection';
  }

  subjectOf(entry: ProjectJournalEntry): ReflectionSubjectView | null {
    return entry.subject ?? null;
  }

  subjectStatus(entry: ProjectJournalEntry): string | null {
    const subject = this.subjectOf(entry);
    return subject === null ? null : statusLabel(subject.status);
  }

  ownerLink(entry: ProjectJournalEntry): unknown[] {
    if (entry.origin.pageKind === 'home' || entry.origin.pageKind === 'reflections') {
      return ['/projects', entry.origin.projectId, 'pages', entry.origin.pageKind];
    }
    return ['/projects', entry.origin.projectId];
  }

  ownerFragment(entry: ProjectJournalEntry): string {
    return `section-${entry.origin.sectionId}`;
  }
}
