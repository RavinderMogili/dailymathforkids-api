/**
 * Safety guard for tests that make real network calls (and, for
 * integration.test.js, real writes) against a deployed API.
 *
 * Background: on 2026-09-06, running the default `npm test` locally executed
 * tests/integration.test.js against production (it was not yet isolated from
 * the default test run) and created two real test-prefixed user accounts
 * with no cleanup credential available locally, since the SUPABASE_SERVICE_ROLE
 * env var was not set in that shell. This guard exists so that can't happen
 * by accident again: tests in tests/live/ are excluded from the default
 * `npm test` (see jest.config.js testPathIgnorePatterns) and, even when
 * deliberately run via `npm run test:live`, refuse to start unless a
 * non-production target is explicitly configured.
 *
 * This intentionally has no override for the production host — if you want
 * these tests to exercise production the way the existing
 * .github/workflows/test.yml integration-tests job did, that is a decision
 * to make explicitly (e.g. point LIVE_API_BASE_URL at production in a CI
 * secret with SUPABASE_SERVICE_ROLE also set so cleanup runs) — not something
 * this guard will do implicitly.
 */

// Add any other known production hostnames here — never remove this entry.
const PRODUCTION_HOSTS = ['dailymathforkids-api.vercel.app'];

export function getLiveApiBase() {
  if (process.env.ALLOW_LIVE_TESTS !== 'true') {
    throw new Error(
      'Live tests are disabled by default because they make real network calls ' +
      '(tests/live/integration.test.js also makes real writes). To run them ' +
      'deliberately:\n' +
      '  ALLOW_LIVE_TESTS=true LIVE_API_BASE_URL=https://your-staging-deploy.vercel.app npm run test:live\n' +
      'There is no default target and no production override — see this file\'s ' +
      'header comment for why.'
    );
  }

  const base = process.env.LIVE_API_BASE_URL;
  if (!base) {
    throw new Error(
      'LIVE_API_BASE_URL must be set explicitly when ALLOW_LIVE_TESTS=true — ' +
      'there is no default target.'
    );
  }

  let hostname;
  try {
    hostname = new URL(base).hostname;
  } catch (e) {
    throw new Error(`LIVE_API_BASE_URL is not a valid URL: ${base}`);
  }

  if (PRODUCTION_HOSTS.includes(hostname)) {
    throw new Error(
      `Refusing to run live tests against the production API host (${hostname}). ` +
      'Point LIVE_API_BASE_URL at a staging/preview deployment instead. If you ' +
      'deliberately want to test against production, that requires changing this ' +
      'guard\'s PRODUCTION_HOSTS check explicitly, in its own reviewed change — ' +
      'not by routing around it here.'
    );
  }

  return base.replace(/\/+$/, '');
}
