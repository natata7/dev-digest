/** Agent paths first, then skill paths in order; first occurrence wins. */
export function effectiveContextPaths(agentPaths: string[], skillPathsInOrder: string[][]): string[] {
  return [...new Set([...agentPaths, ...skillPathsInOrder.flat()])];
}
