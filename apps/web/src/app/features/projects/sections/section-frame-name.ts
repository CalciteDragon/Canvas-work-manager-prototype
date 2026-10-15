import { InjectionToken, type Signal } from '@angular/core';

/**
 * The name the enclosing frame displays for its section: `nameOf` in a section frame,
 * `shortcutNameOf` in a shortcut frame (slice 72, L5-004). Each frame provides it in its own
 * `providers`, and `NgComponentOutlet` content inherits the frame's injector, so content can
 * name itself without a new outlet input, which `setInput` would reject on content components
 * that lack it. Absent outside a frame (a story or a bare test), so readers inject it optionally.
 */
export const SECTION_FRAME_NAME = new InjectionToken<Signal<string>>('SECTION_FRAME_NAME');
