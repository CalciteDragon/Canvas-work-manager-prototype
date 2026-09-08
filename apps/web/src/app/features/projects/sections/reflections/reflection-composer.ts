import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, input, output } from '@angular/core';
import type { ReflectionSubjectView } from '@cwm/contracts';

export interface ReflectionDraft {
  body: string;
  title: string;
  prompt: string;
}

/** The shared §36 writing surface used by a canvas section and the Reflections page. */
@Component({
  selector: 'app-reflection-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reflection-composer.html',
  styleUrl: './reflection-composer.scss',
})
export class ReflectionComposer {
  readonly readOnly = input(false);
  readonly subject = input<ReflectionSubjectView | null>(null);
  readonly error = input<string | null>(null);
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
