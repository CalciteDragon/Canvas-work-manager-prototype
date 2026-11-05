import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { LIVE_UPDATES } from '../../../../core/live/live-updates';
import { FakeLiveUpdates } from '../../../../core/live/testing/fake-live-updates';
import { MarkdownDraftStore } from './markdown-draft-store';

const setup = () => {
  const live = new FakeLiveUpdates();
  TestBed.configureTestingModule({ providers: [{ provide: LIVE_UPDATES, useValue: live }] });
  return { live, store: TestBed.inject(MarkdownDraftStore) };
};

describe('MarkdownDraftStore', () => {
  it('keeps one draft and its base per section, and take hands it over once', () => {
    const { store } = setup();
    store.keep('section-a', { draft: '# Mine', base: '# Plan' });
    store.keep('section-b', { draft: '# Other', base: '' });
    expect(store.take('section-a')).toEqual({ draft: '# Mine', base: '# Plan' });
    expect(store.take('section-a')).toBeNull();
    expect(store.take('section-b')).toEqual({ draft: '# Other', base: '' });
  });
  it('forget drops a kept draft', () => {
    const { store } = setup();
    store.keep('section-a', { draft: '# Mine', base: '# Plan' });
    store.forget('section-a');
    expect(store.take('section-a')).toBeNull();
  });
  it('prototype.reloaded clears every draft; other events keep them', () => {
    const { live, store } = setup();
    store.keep('section-a', { draft: '# Mine', base: '# Plan' });
    store.keep('section-b', { draft: '# Other', base: '' });
    live.emit({ type: 'project.section_updated', entityId: 'project-a' });
    expect(store.take('section-b')).not.toBeNull();
    live.emit({ type: 'prototype.reloaded', entityId: 'seed' });
    expect(store.take('section-a')).toBeNull();
  });
  it('a keep from before prototype.reloaded is dropped; one from after is kept', () => {
    const { live, store } = setup();
    const opened = store.generation;
    live.emit({ type: 'prototype.reloaded', entityId: 'seed' });
    store.keep('section-a', { draft: '# Old', base: '# Plan' }, opened);
    expect(store.take('section-a')).toBeNull();
    store.keep('section-a', { draft: '# New', base: '# Plan' }, store.generation);
    expect(store.take('section-a')).toEqual({ draft: '# New', base: '# Plan' });
  });
});
