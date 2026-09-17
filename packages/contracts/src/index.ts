/**
 * The one place every entity in the prototype is defined (§11). Angular forms, the
 * prototype API, MCP tool schemas, tests and seed validation all import from here —
 * there is no second definition of any of these shapes anywhere in the repository.
 */
export * from './activity';
export * from './agent';
export * from './common';
export * from './dashboard';
export * from './document';
export * from './ids';
export * from './inputs';
export * from './live';
export * from './milestone';
export * from './operation-history';
export * from './project';
export * from './project-page';
export * from './project-archive';
export * from './project-journal';
export * from './project-todos';
export * from './prototype';
export * from './progress';
export * from './reflection';
export * from './section';
export * from './section-shortcut';
export * from './task';
export * from './timeline';
export * from './undo';
export * from './user';
export * from './workspace';
