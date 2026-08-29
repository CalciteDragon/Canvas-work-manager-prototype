/**
 * A name that is not in the registry.
 *
 * Deliberately **not** `EntityNotFoundError`. That error means "an id that does not resolve
 * *for this actor*", and it is deliberately indistinguishable from a foreign id so a 404
 * cannot confirm that someone else's project exists. A tool name is registry metadata: the
 * list is public, unfiltered by grant, and there is nothing to hide. Slice 15 maps this to
 * MCP's own unknown-tool response.
 */
export class UnknownToolError extends Error {
  constructor(readonly tool: string) {
    super(`no tool named "${tool}" is registered`);
    this.name = 'UnknownToolError';
  }
}
