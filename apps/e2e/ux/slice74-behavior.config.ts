import { defineConfig } from '@playwright/test';
import existing from './slice74.config';

/** Run browser feedback journeys against the same isolated production-build rig. */
export default defineConfig({ ...existing, outputDir: '../ux-output/slice74-feedback-results', testDir: '..', testIgnore: ['**/ux/**'], testMatch: ['feedback.spec.ts'], timeout: 90_000 });
