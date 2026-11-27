import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * Windows drive-letter casing.
 *
 * A shell can enter this directory as either `c:\...` or `C:\...`. When Vite's
 * root disagrees with Node's view of the path, the `vitest` package is resolved
 * twice and the test runner's context is lost - every file then fails at its
 * first `describe()` with "Cannot read properties of undefined (reading
 * 'config')". Normalising the root removes one half of that mismatch.
 *
 * It does not remove all of it (workers still inherit the shell's cwd), which
 * is why `globals: true` below is load-bearing rather than a style choice:
 * `describe` / `it` / `expect` must come from the runner, not from an
 * `import ... from 'vitest'` that can resolve to a second copy. Test files in
 * this project therefore use the globals and do not import them.
 */
function normaliseRoot(dir: string): string {
  return path.resolve(dir).replace(/^([a-z]):/, (_, drive: string) => `${drive.toUpperCase()}:`)
}

const root = normaliseRoot(__dirname)

export default defineConfig({
  plugins: [react()],
  root,
  // Per-checkout cache. node_modules can be a shared junction across git
  // worktrees, and the default cache lives inside it (node_modules/.vite), so
  // concurrent test runs in different worktrees would read and write the same
  // cache - one such run here reported 55 of 69 tests.
  cacheDir: path.join(root, '.vite-cache'),
  test: {
    root,
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    // Anchored on `@/` so scoped packages such as `@testing-library/jest-dom`
    // are not rewritten into the project root.
    alias: [{ find: /^@\//, replacement: `${root}/` }],
  },
})
