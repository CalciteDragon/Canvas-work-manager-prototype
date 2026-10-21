import { defineConfig } from '@playwright/test';
import existing from './slice75.config';

/** Run Slice 75's browser journeys against the same isolated production-build rig. */
export default defineConfig({ ...existing, outputDir: '../ux-output/slice75-behavior-results', testDir: '..', testIgnore: ['**/ux/**'], testMatch: ['placement.spec.ts'], timeout: 90_000 });
