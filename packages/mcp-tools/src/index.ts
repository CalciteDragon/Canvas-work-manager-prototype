/**
 * §55's transport-free tool registry: what the §54 tools *mean*, with no MCP plumbing.
 *
 * Slice 15 mounts this behind the official SDK over Streamable HTTP and stdio (§50, §59).
 * Nothing in here knows that is coming.
 */
export * from './errors';
export * from './registry';
export * from './tool';
