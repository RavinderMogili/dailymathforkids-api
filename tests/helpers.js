/**
 * Shared test helpers — mock request/response objects and Supabase client.
 */

// Mock HTTP request
export function mockReq({ method = 'GET', query = {}, body = {}, headers = {} } = {}) {
  return { method, query, body, headers };
}

// Mock HTTP response with chainable status().json()/end()
export function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(k, v) { res.headers[k] = v; },
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    end() { return res; },
  };
  return res;
}

// Build a chainable Supabase query mock
// Usage: const sb = mockSupabase({ from: { users: { select: { data: [...], error: null } } } });
export function mockSupabase(config = {}) {
  function makeChain(tableConfig) {
    const chain = {};
    const methods = ['select', 'insert', 'upsert', 'update', 'delete',
      'eq', 'like', 'not', 'gte', 'lte', 'order', 'limit', 'single', 'maybeSingle'];
    for (const m of methods) {
      chain[m] = (..._args) => {
        // If this method has a configured return value, resolve to it
        if (tableConfig[m]) {
          const val = tableConfig[m];
          // If it's an async result (data/error), make all further chains return it
          if (val.data !== undefined || val.error !== undefined) {
            return { ...chain, ...val, then: (fn) => Promise.resolve(fn(val)) };
          }
        }
        return chain;
      };
    }
    // Default: resolve with empty data
    chain.then = (fn) => Promise.resolve(fn({ data: null, error: null }));
    return chain;
  }

  return {
    from(table) {
      const tableConfig = config.from?.[table] || {};
      return makeChain(tableConfig);
    },
  };
}

// Set dummy env vars for tests
export function setEnv() {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-role-key';
  process.env.RESEND_API_KEY = '';
}
