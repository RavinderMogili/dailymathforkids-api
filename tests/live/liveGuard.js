/**
 * Safety guard for tests that make real network calls (and, for
 * integration.test.js, real writes) against a deployed API.
 *
 * Background: on 2026-09-06, running the default `npm test` locally executed
 * tests/integration.test.js against production (it was not yet isolated from
 * the default test run) and created two real test-prefixed user accounts
 * with no cleanup credential available locally, since the SUPABASE_SERVICE_ROLE
 * env var was not set in that shell. On 2026-09-07 the same class of incident
 * happened again by a different path: a fresh branch cut from `origin/main`
 * (which didn't yet have this guard, since it was only committed locally)
 * still had integration.test.js sitting unguarded at tests/integration.test.js,
 * so a bare `npm test` there picked it up via jest's default testMatch and hit
 * production again. See tests/live/INCIDENT_2026-09-06.md and
 * tests/live/INCIDENT_2026-09-07.md for the full writeups.
 *
 * This guard is defense-in-depth against both failure modes, at three
 * independent layers — losing any one of them still leaves the others:
 *   1. File location: live/integration tests live under tests/live/, which
 *      jest.config.js's testPathIgnorePatterns excludes from the default
 *      `npm test` run (see tests/no-prod-in-default-run.test.js, which
 *      regression-tests this exclusion directly).
 *   2. Opt-in required even for direct execution: this function is called at
 *      module scope (not inside a test body) by every file under tests/live/,
 *      so even `jest tests/live/integration.test.js` run directly — bypassing
 *      testPathIgnorePatterns entirely — throws before a single test runs,
 *      unless ALLOW_LIVE_TESTS=true and a non-production LIVE_API_BASE_URL
 *      are both set. There is no default target.
 *   3. Production host requires a second, distinct acknowledgement: setting
 *      ALLOW_LIVE_TESTS=true and pointing LIVE_API_BASE_URL at the known
 *      production host is still not enough on its own (see below) — that
 *      combination is exactly what unlocks a staging target, so it must not
 *      also be what unlocks production.
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
      'There is no default target and no implicit production override — see ' +
      'this file\'s header comment for why.'
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
    // Deliberately a *separate* opt-in from ALLOW_LIVE_TESTS, and deliberately
    // high-friction: the value must be the exact production hostname, typed
    // out, so it can't be satisfied by a generic "yes"/"true" flag someone
    // sets out of habit. If you deliberately intend to exercise production
    // (e.g. matching what the old .github/workflows/test.yml integration-tests
    // job used to do before it was pointed at staging), set both:
    //   ALLOW_LIVE_TESTS=true
    //   LIVE_API_BASE_URL=https://dailymathforkids-api.vercel.app
    //   CONFIRM_PRODUCTION_LIVE_TESTS=dailymathforkids-api.vercel.app
    const ack = (process.env.CONFIRM_PRODUCTION_LIVE_TESTS || '').trim();
    if (ack !== hostname) {
      throw new Error(
        `Refusing to run live tests against the production API host (${hostname}) ` +
        'without a separate, explicit acknowledgement. Point LIVE_API_BASE_URL at ' +
        'a staging/preview deployment instead, or, if you deliberately intend to ' +
        `exercise production, also set CONFIRM_PRODUCTION_LIVE_TESTS=${hostname} ` +
        '(the exact hostname). This is intentionally a second, separate opt-in from ' +
        'ALLOW_LIVE_TESTS — see this file\'s header comment.'
      );
    }
  }

  return base.replace(/\/+$/, '');
}
