/**
 * Unit tests for tests/live/liveGuard.js — the safety guard that prevents
 * live/integration tests from running by default or against production.
 * This test itself makes no network calls; it only exercises the guard's
 * decision logic, so it belongs in the default (local) test run.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getLiveApiBase } from './live/liveGuard.js';

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  delete process.env.ALLOW_LIVE_TESTS;
  delete process.env.LIVE_API_BASE_URL;
  delete process.env.CONFIRM_PRODUCTION_LIVE_TESTS;
}

beforeEach(resetEnv);
afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

describe('liveGuard.getLiveApiBase', () => {
  it('refuses to run when ALLOW_LIVE_TESTS is unset', () => {
    expect(() => getLiveApiBase()).toThrow(/disabled by default/i);
  });

  it('refuses to run when ALLOW_LIVE_TESTS is set to something other than "true"', () => {
    process.env.ALLOW_LIVE_TESTS = 'yes';
    expect(() => getLiveApiBase()).toThrow(/disabled by default/i);
  });

  it('refuses to run when LIVE_API_BASE_URL is not set, even with ALLOW_LIVE_TESTS=true', () => {
    process.env.ALLOW_LIVE_TESTS = 'true';
    expect(() => getLiveApiBase()).toThrow(/LIVE_API_BASE_URL must be set/i);
  });

  it('rejects the known production host when ALLOW_LIVE_TESTS is the only opt-in set', () => {
    process.env.ALLOW_LIVE_TESTS = 'true';
    process.env.LIVE_API_BASE_URL = 'https://dailymathforkids-api.vercel.app';
    expect(() => getLiveApiBase()).toThrow(/production API host/i);
  });

  it('rejects the production host even with a trailing slash or path', () => {
    process.env.ALLOW_LIVE_TESTS = 'true';
    process.env.LIVE_API_BASE_URL = 'https://dailymathforkids-api.vercel.app/api/';
    expect(() => getLiveApiBase()).toThrow(/production API host/i);
  });

  it('rejects the production host when the acknowledgement value is wrong', () => {
    process.env.ALLOW_LIVE_TESTS = 'true';
    process.env.LIVE_API_BASE_URL = 'https://dailymathforkids-api.vercel.app';
    process.env.CONFIRM_PRODUCTION_LIVE_TESTS = 'true'; // not the hostname
    expect(() => getLiveApiBase()).toThrow(/production API host/i);
  });

  it('rejects the production host when the acknowledgement is set but ALLOW_LIVE_TESTS is not', () => {
    process.env.LIVE_API_BASE_URL = 'https://dailymathforkids-api.vercel.app';
    process.env.CONFIRM_PRODUCTION_LIVE_TESTS = 'dailymathforkids-api.vercel.app';
    expect(() => getLiveApiBase()).toThrow(/disabled by default/i);
  });

  it('allows the production host only with both ALLOW_LIVE_TESTS and the exact-hostname acknowledgement', () => {
    process.env.ALLOW_LIVE_TESTS = 'true';
    process.env.LIVE_API_BASE_URL = 'https://dailymathforkids-api.vercel.app';
    process.env.CONFIRM_PRODUCTION_LIVE_TESTS = 'dailymathforkids-api.vercel.app';
    expect(getLiveApiBase()).toBe('https://dailymathforkids-api.vercel.app');
  });

  it('rejects a malformed URL with a clear error rather than crashing oddly', () => {
    process.env.ALLOW_LIVE_TESTS = 'true';
    process.env.LIVE_API_BASE_URL = 'not-a-url';
    expect(() => getLiveApiBase()).toThrow(/not a valid URL/i);
  });

  it('accepts an explicit non-production target', () => {
    process.env.ALLOW_LIVE_TESTS = 'true';
    process.env.LIVE_API_BASE_URL = 'https://my-staging-deploy.vercel.app';
    expect(getLiveApiBase()).toBe('https://my-staging-deploy.vercel.app');
  });

  it('strips a trailing slash from an accepted non-production target', () => {
    process.env.ALLOW_LIVE_TESTS = 'true';
    process.env.LIVE_API_BASE_URL = 'https://my-staging-deploy.vercel.app/';
    expect(getLiveApiBase()).toBe('https://my-staging-deploy.vercel.app');
  });

  it('treats localhost as non-production (useful for testing a local API dev server)', () => {
    process.env.ALLOW_LIVE_TESTS = 'true';
    process.env.LIVE_API_BASE_URL = 'http://localhost:3000';
    expect(getLiveApiBase()).toBe('http://localhost:3000');
  });
});
