import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('renders the shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Canvas Work Manager');
  });

  // No separate test for `@cwm/contracts` resolving: App imports it statically, so the
  // test above cannot compile — let alone render — if the workspace package fails to
  // resolve through the Angular builder.
});
