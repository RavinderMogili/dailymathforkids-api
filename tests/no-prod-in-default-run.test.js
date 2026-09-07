/**
 * Regression proof that the default `npm test` run cannot contact
 * production. This is the check that would have caught both the
 * 2026-09-06 and 2026-09-07 incidents (see tests/live/INCIDENT_*.md):
 * in both cases, a test file with a hardcoded production URL and no
 * opt-in guard ended up inside the set of files jest's default config
 * actually executes.
 *
 * This test asserts the real, computed jest file list (via
 * `--listTests`, not a reimplementation of jest's own glob/ignore
 * matching) excludes tests/live/, and independently scans every file
 * jest would actually run for a hardcoded reference to the production
 * hostname, as a second, unrelated line of defense.
 */
import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Duplicated (not imported) from tests/live/liveGuard.js on purpose — this
// check must still catch a hardcoded production URL even if liveGuard.js
// itself were ever misconfigured or bypassed.
const PRODUCTION_HOST = 'dailymathforkids-api.vercel.app';

function listDefaultJestFiles() {
  const output = execFileSync(
    process.execPath,
    ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', '--listTests'],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  );
  return output.split('\n').map(l => l.trim()).filter(Boolean);
}

describe('Default `npm test` run cannot contact production (regression)', () => {
  it('the computed default test file list excludes everything under tests/live/', () => {
    const files = listDefaultJestFiles();
    expect(files.length).toBeGreaterThan(0);
    const liveFiles = files.filter(f => f.replace(/\\/g, '/').includes('/tests/live/'));
    expect(liveFiles).toEqual([]);
  });

  it('no file the default run would execute contains the production hostname, outside the guard tests that name it on purpose', () => {
    // liveGuard.test.js and this file itself legitimately reference
    // PRODUCTION_HOST as data, to test the guard's own string-matching
    // logic — they never call fetch() against it. Everything else in the
    // default run should have no reason to mention it at all.
    const ALLOWED_TO_MENTION_IT = ['liveGuard.test.js', 'no-prod-in-default-run.test.js'];
    const files = listDefaultJestFiles();
    expect(files.length).toBeGreaterThan(0);
    const offenders = files
      .filter(f => !ALLOWED_TO_MENTION_IT.includes(path.basename(f)))
      .filter(f => fs.readFileSync(f, 'utf8').includes(PRODUCTION_HOST));
    expect(offenders).toEqual([]);
  });

  it('jest.config.js explicitly excludes tests/live/ (so the above isn\'t accidental)', async () => {
    const config = (await import('../jest.config.js')).default;
    expect(config.testPathIgnorePatterns.some(p => p.includes('tests/live'))).toBe(true);
  });

  it('package.json "test" script has no flag that could pull tests/live/ back in', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.scripts.test).not.toMatch(/tests[\\/]live/);
    expect(pkg.scripts.test).not.toMatch(/testPathPatterns/);
    expect(pkg.scripts['test:live']).toMatch(/tests[\\/]live/);
  });

  it('sanity check: tests/live/ actually contains production-URL-capable test files', () => {
    const liveDir = path.join(repoRoot, 'tests', 'live');
    const liveTestFiles = fs.readdirSync(liveDir).filter(f => f.endsWith('.test.js'));
    expect(liveTestFiles.length).toBeGreaterThan(0);
    const guarded = liveTestFiles.every(f =>
      fs.readFileSync(path.join(liveDir, f), 'utf8').includes('liveGuard')
    );
    expect(guarded).toBe(true);
  });
});
