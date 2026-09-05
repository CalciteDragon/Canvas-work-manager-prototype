import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEFAULT_DATA_PATH, writeSeedFile } from '@cwm/prototype-data';
import {
  JsonActivityRepository,
  JsonAgentConnectionRepository,
  JsonMilestoneRepository,
  JsonDataStore,
  JsonProjectPageRepository,
  JsonProjectRepository,
  JsonReflectionRepository,
  JsonSectionRepository,
  JsonTaskRepository,
  JsonUserRepository,
  unitOfWorkFor,
  type DataStore,
} from '@cwm/repositories';

/**
 * One JSON file, per §14. `CWM_DATA_FILE` overrides it — resolved against the process's
 * cwd — which is what lets the acceptance script run against a temp file instead of
 * trampling the developer's workspace.
 *
 * The default is repo-anchored rather than cwd-relative on purpose: `pnpm dev:host`
 * runs with cwd `apps/prototype-host`, and a relative default would quietly create a
 * second data file there that `pnpm prototype:reset` never touches.
 */
export const dataFilePath = (): string => {
  const override = process.env['CWM_DATA_FILE'];
  return override === undefined || override === '' ? DEFAULT_DATA_PATH : resolve(override);
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

export interface Persistence {
  path: string;
  store: DataStore;
  projects: JsonProjectRepository;
  /** §26's pages, which own the sections below. */
  pages: JsonProjectPageRepository;
  sections: JsonSectionRepository;
  tasks: JsonTaskRepository;
  milestones: JsonMilestoneRepository;
  reflections: JsonReflectionRepository;
  activities: JsonActivityRepository;
  /** §52's connections and the users that own them, for §51's authenticator and §53's UI. */
  agents: JsonAgentConnectionRepository;
  users: JsonUserRepository;
  unitOfWork: ReturnType<typeof unitOfWorkFor>;
}

/** Seeds on first run so a fresh clone can `curl` without a setup step (§76). */
export const loadPersistence = async (path = dataFilePath()): Promise<Persistence> => {
  if (!(await exists(path))) await writeSeedFile(undefined, { targetPath: path });

  const store = await JsonDataStore.load(path);
  return {
    path,
    store,
    projects: new JsonProjectRepository(store),
    pages: new JsonProjectPageRepository(store),
    sections: new JsonSectionRepository(store),
    tasks: new JsonTaskRepository(store),
    milestones: new JsonMilestoneRepository(store),
    reflections: new JsonReflectionRepository(store),
    activities: new JsonActivityRepository(store),
    agents: new JsonAgentConnectionRepository(store),
    users: new JsonUserRepository(store),
    unitOfWork: unitOfWorkFor(store),
  };
};
