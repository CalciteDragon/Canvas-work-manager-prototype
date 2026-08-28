import { Injectable, inject, signal } from '@angular/core';
import type { ProjectId, Reflection, ReflectionId } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e);
@Injectable()
export class ReflectionsStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY); private generation = 0;
  private readonly projectIdState = signal<ProjectId | null>(null); private readonly itemsState = signal<Reflection[]>([]); private readonly loadingState = signal(false); private readonly errorState = signal<string | null>(null); private readonly editingIdState = signal<ReflectionId | null>(null);
  readonly projectId = this.projectIdState.asReadonly(); readonly reflections = this.itemsState.asReadonly(); readonly items = this.reflections; readonly loading = this.loadingState.asReadonly(); readonly error = this.errorState.asReadonly(); readonly editingId = this.editingIdState.asReadonly();
  async load(projectId: ProjectId) { const generation = ++this.generation; this.projectIdState.set(projectId); this.loadingState.set(true); this.errorState.set(null); try { const items = await this.gateway.reflections.list(projectId); if (generation === this.generation) this.itemsState.set([...items].sort((a,b) => b.createdAt.localeCompare(a.createdAt))); } catch (e) { if (generation === this.generation) { this.itemsState.set([]); this.errorState.set(messageOf(e)); } } finally { if (generation === this.generation) this.loadingState.set(false); } }
  async create(bodyRaw: string, titleRaw = '', prompt = ''): Promise<boolean> { const body = bodyRaw.trim(); const projectId = this.projectIdState(); if (!body || projectId === null) { this.errorState.set('A reflection body is required.'); return false; } try { const created = await this.gateway.reflections.create({ projectId, body, ...(titleRaw.trim() ? { title: titleRaw.trim() } : {}), ...(prompt ? { prompt } : {}) }); this.itemsState.update((items) => [created, ...items]); return true; } catch (e) { this.errorState.set(messageOf(e)); return false; } }
  beginEdit(id: ReflectionId) { this.editingIdState.set(id); } cancelEdit() { this.editingIdState.set(null); }
  async saveEdit(titleRaw: string, bodyRaw: string): Promise<boolean> { const id = this.editingIdState(); const body = bodyRaw.trim(); if (id === null || !body) return false; try { const updated = await this.gateway.reflections.update(id, { body, title: titleRaw.trim() || null }); this.itemsState.update((items) => items.map((item) => item.id === id ? updated : item)); this.editingIdState.set(null); return true; } catch (e) { this.errorState.set(messageOf(e)); return false; } }
  update(id: ReflectionId, bodyRaw: string, titleRaw: string) { this.editingIdState.set(id); return this.saveEdit(titleRaw, bodyRaw); }
}
