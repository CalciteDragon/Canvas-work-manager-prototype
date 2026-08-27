import { InjectionToken } from '@angular/core';
import type {
  CreateSectionInput,
  CreateTaskInput,
  Project,
  ProjectId,
  ProjectQuery,
  ProjectSection,
  SectionId,
  Task,
  TaskId,
  TaskQuery,
  UpdateSectionInput,
  UpdateTaskInput,
} from '@cwm/contracts';

/**
 * §9's `TaskGateway`, verbatim. It is the one sub-interface the spec pins method for
 * method, so it is implemented in full even though nothing renders a task until Slice 7.
 */
export interface TaskGateway {
  list(query: TaskQuery): Promise<Task[]>;
  get(id: TaskId): Promise<Task>;
  create(input: CreateTaskInput): Promise<Task>;
  update(id: TaskId, input: UpdateTaskInput): Promise<Task>;
  complete(id: TaskId): Promise<Task>;
  archive(id: TaskId): Promise<void>;
}

/**
 * §9 gives `ProjectGateway` no shape, so it grows with the code that calls it: the shell
 * lists projects, and the project page (Slice 8) will get one. `create`/`update`/`archive`
 * arrive with the UI that writes — a method the UI cannot exercise is a claim no test
 * backs.
 */
export interface ProjectGateway {
  list(query: ProjectQuery): Promise<Project[]>;
  get(id: ProjectId): Promise<Project>;
}

/**
 * §31's frame affordances, as a gateway. `move` is deliberately absent: nothing in the UI
 * reorders sections until Slice 9 wires Angular CDK drag-drop, and this file's rule is that
 * a method the UI cannot exercise is a claim no test backs. The domain service and
 * `POST /api/sections/:id/move` both exist — the gateway method arrives with the drop
 * handler that calls it.
 */
export interface SectionGateway {
  list(projectId: ProjectId): Promise<ProjectSection[]>;
  create(projectId: ProjectId, input: CreateSectionInput): Promise<ProjectSection>;
  update(id: SectionId, input: UpdateSectionInput): Promise<ProjectSection>;
  duplicate(id: SectionId): Promise<ProjectSection>;
  remove(id: SectionId): Promise<void>;
}

/**
 * The boundary of §8: every component depends on this interface and never on a transport.
 *
 * §9 sketches eight members. Only the three with implementations are declared here; the
 * rest arrive with the slice that builds them, because five interfaces nothing implements
 * would force every adapter to fake five members and would document features that do not
 * exist:
 *
 * - `milestones` — Slice 19
 * - `reflections` — Slice 10
 * - `dashboard` — Slice 11
 * - `search` — Slice 10
 * - `activity` — Slice 13
 */
export interface WorkManagerGateway {
  projects: ProjectGateway;
  sections: SectionGateway;
  tasks: TaskGateway;
}

export const WORK_MANAGER_GATEWAY = new InjectionToken<WorkManagerGateway>('WORK_MANAGER_GATEWAY');
