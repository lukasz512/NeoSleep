/**
 * CORE-126: the harness e2e port for one worktree, derived from its path
 * (5200–5999). Two worktrees pushing at once no longer collide on one fixed
 * port, and the same worktree always gets the same port.
 */
export function harnessPort(dir: string): number {
  let hash = 0;
  for (const ch of dir) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return 5200 + (hash % 800);
}
