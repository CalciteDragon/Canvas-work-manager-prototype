import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteFocus } from './route-focus';

@Component({ template: '{{ revision() }}' })
class RenderHost { readonly revision = signal(0); }

afterEach(() => { TestBed.resetTestingModule(); document.body.replaceChildren(); vi.useRealTimers(); });

describe('RouteFocus', () => {
  const setup = () => {
    const events = new Subject<NavigationEnd>();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { events } }] });
    const service = TestBed.inject(RouteFocus);
    const fixture = TestBed.createComponent(RenderHost);
    fixture.autoDetectChanges();
    const main = document.createElement('main');
    main.tabIndex = -1;
    document.body.append(main);
    const navigate = (id: number) => events.next(new NavigationEnd(id, '/app', '/app'));
    return { service, fixture, main, navigate };
  };

  it('ignores load and a redirect without input, then waits for a user navigation heading', async () => {
    const { service, fixture, main, navigate } = setup();
    navigate(1); navigate(2);
    fixture.detectChanges(); TestBed.tick(); await fixture.whenStable();
    expect(document.activeElement).toBe(document.body);
    service.noteInput({ isTrusted: true });
    navigate(3);
    fixture.detectChanges(); TestBed.tick(); await fixture.whenStable();
    expect(document.activeElement).toBe(document.body);
    const heading = document.createElement('h1');
    heading.tabIndex = -1; heading.setAttribute('data-route-focus', ''); main.append(heading);
    fixture.componentInstance.revision.update(value => value + 1);
    fixture.detectChanges(); TestBed.tick(); await fixture.whenStable();
    expect(document.activeElement).toBe(heading);
  });

  it('never overrides connected focus or a hand-off during the wait', async () => {
    const { service, fixture, main, navigate } = setup();
    navigate(1); service.noteInput({ isTrusted: true }); navigate(2);
    const button = document.createElement('button'); main.append(button); button.focus();
    const heading = document.createElement('h1');
    heading.tabIndex = -1; heading.setAttribute('data-route-focus', ''); main.append(heading);
    fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(button);
  });

  it('bounds a missing heading and falls back to main', async () => {
    const { service, main, navigate } = setup();
    vi.useFakeTimers();
    navigate(1); service.noteInput({ isTrusted: true }); navigate(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.activeElement).toBe(main);
  });
});
