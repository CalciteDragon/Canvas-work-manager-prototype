import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PrototypeNotesFileSchema,
  type CreatePrototypeNoteInput,
  type PrototypeNote,
} from '@cwm/contracts';

/**
 * §79's feedback notes. Deliberately disposable (§71): read the file, push one entry,
 * write it back atomically. No index, no query, no pagination.
 *
 * **Repo-anchored, not cwd-relative** — the same trap `persistence/store.ts` documents.
 * `pnpm dev:host` runs with cwd `apps/prototype-host`, so a relative path would quietly
 * start a second notes file that nothing else ever reads.
 */
export const DEFAULT_NOTES_PATH = fileURLToPath(new URL('../../../.prototype/notes.json', import.meta.url));

export interface NotesFileOperations {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
}

const nodeFileOperations: NotesFileOperations = { readFile, writeFile, rename, mkdir };

export interface AppendNoteOptions {
  path?: string;
  fileOperations?: NotesFileOperations;
  /**
   * Real time, **not** the simulated clock. A note records when an observation happened;
   * filing one in the future because the panel had moved the clock to next Friday would
   * put the log out of the order it was actually written in.
   */
  now?: () => Date;
}

const isMissingFile = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';

/**
 * A missing file is a fresh checkout and starts empty. A file that exists but does not
 * parse is **not** overwritten: it is 26 KB of hand-written observations, and silently
 * replacing it with a one-entry file is the worst thing this function could do.
 */
const readNotes = async (path: string, fileOperations: NotesFileOperations): Promise<PrototypeNote[]> => {
  let source: string;
  try {
    source = await fileOperations.readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }

  const parsed = PrototypeNotesFileSchema.safeParse(JSON.parse(source));
  if (!parsed.success) {
    throw new Error(`"${path}" is not a prototype notes file — refusing to overwrite it`);
  }
  return parsed.data.notes;
};

/** `note-2026-08-28-003`: sortable, readable, and unique within the day it was written. */
const nextId = (notes: readonly PrototypeNote[], at: Date): string => {
  const day = at.toISOString().slice(0, 10);
  const prefix = `note-${day}-`;
  const highest = notes
    .filter((note) => note.id.startsWith(prefix))
    .reduce((best, note) => Math.max(best, Number(note.id.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(highest + 1).padStart(3, '0')}`;
};

export const appendNote = async (
  input: CreatePrototypeNoteInput,
  options: AppendNoteOptions = {},
): Promise<PrototypeNote> => {
  const path = options.path ?? DEFAULT_NOTES_PATH;
  const fileOperations = options.fileOperations ?? nodeFileOperations;
  const at = (options.now ?? (() => new Date()))();

  const notes = await readNotes(path, fileOperations);
  const note: PrototypeNote = {
    id: nextId(notes, at),
    createdAt: at.toISOString(),
    route: input.route,
    projectId: input.projectId,
    ...(input.slice === undefined ? {} : { slice: input.slice }),
    note: input.note,
  };

  const temporaryPath = `${path}.tmp`;
  await fileOperations.mkdir(dirname(path), { recursive: true });
  await fileOperations.writeFile(temporaryPath, `${JSON.stringify({ notes: [...notes, note] }, null, 2)}\n`, 'utf8');
  await fileOperations.rename(temporaryPath, path);
  return note;
};
