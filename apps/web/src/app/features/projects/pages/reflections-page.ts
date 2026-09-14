import { ChangeDetectionStrategy, Component, ViewChild, computed, effect, inject, input, signal } from '@angular/core';
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
import type { ProjectPageRenderer } from '../project-page-contract';

const statusLabel = (status: string): string => status.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

/** §36's root-wide Reflections page: one composer, a completed-work picker and the journal feed. */
@Component({
  selector: 'app-reflections-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReflectionComposer, RouterLink],
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
