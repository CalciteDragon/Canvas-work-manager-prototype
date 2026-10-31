import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, input, output } from '@angular/core';
import type { ReflectionSubjectView } from '@cwm/contracts';
import { FailureMessage } from '../../../../shared/feedback/failure-message';
import type { Failure } from '../../../../shared/feedback/failure';

/** A section and the Reflections page can both show a composer, so label ids are per instance. */
let nextInstance = 0;

export interface ReflectionDraft {
  body: string;
  title: string;
  prompt: string;
}

/** The shared §36 writing surface used by a canvas section and the Reflections page. */
@Component({
  selector: 'app-reflection-composer',
  imports: [FailureMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reflection-composer.html',
  styleUrl: './reflection-composer.scss',
})
export class ReflectionComposer {
  /** The prompt select's id, for its visible label (slice 72, L5-003). */
  private readonly instance = ++nextInstance;
  protected readonly promptId = `reflection-composer-${this.instance}-prompt`;
  /** The body's id, for its visible label (Slice 78, Open question 7). */
  protected readonly bodyId = `reflection-composer-${this.instance}-body`;
  /** The failure sentence's id: the body's description names it, never the Details (Slice 78). */
  protected readonly errorId = `reflection-composer-${this.instance}-error`;
  readonly readOnly = input(false);
  readonly subject = input<ReflectionSubjectView | null>(null);
  readonly error = input<Failure | null>(null);
  readonly prompts = input<readonly string[]>([
    'What changed?',
    'What went well?',
    "What's blocked?",
    'What should happen next?',
  ]);

  readonly submitted = output<ReflectionDraft>();
  readonly subjectRemoved = output<void>();

  @ViewChild('formElement') private form?: ElementRef<HTMLFormElement>;

  submit(event: SubmitEvent, body: HTMLTextAreaElement, title: HTMLInputElement, prompt: HTMLSelectElement): void {
    event.preventDefault();
    if (this.readOnly()) return;
    this.submitted.emit({ body: body.value, title: title.value, prompt: prompt.value });
  }

  clear(): void {
    this.form?.nativeElement.reset();
  }
}
