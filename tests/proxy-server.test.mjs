import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getFreePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : null;
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      if (!port) {
        reject(new Error('Failed to resolve free port.'));
        return;
      }
      resolve(port);
    });
  });
  server.on('error', reject);
});

const startProxy = async (envOverrides = {}, options = {}) => {
  const port = await getFreePort();
  const env = {
    ...process.env,
    PORT: String(port),
    CORS_ORIGIN: '*',
    ...envOverrides
  };

  const child = spawn('node', ['proxy-server.mjs'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const output = [];
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));

  const baseUrl = `http://127.0.0.1:${port}`;
  const startupHeaders = {};
  if (options.startupSecret) {
    startupHeaders['x-proxy-secret'] = options.startupSecret;
  }

  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) {
      throw new Error(`Proxy exited early: ${output.join('')}`);
    }
    try {
      const response = await fetch(`${baseUrl}/__healthcheck__`, { headers: startupHeaders });
      if (response.status === 404) {
        return {
          baseUrl,
          stop: async () => {
            if (child.exitCode === null) {
              child.kill();
              await wait(80);
            }
          }
        };
      }
    } catch {
      // Keep polling until server is ready.
    }
    await wait(50);
  }

  child.kill();
  throw new Error(`Timed out waiting for proxy startup: ${output.join('')}`);
};

test('proxy handles CORS preflight', async () => {
  const server = await startProxy();
  try {
    const response = await fetch(`${server.baseUrl}/api/gemini`, { method: 'OPTIONS' });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
  } finally {
    await server.stop();
  }
});

test('proxy rejects mismatched shared secret', async () => {
  const server = await startProxy({ PROXY_SHARED_SECRET: 'expected-secret' }, { startupSecret: 'expected-secret' });
  try {
    const response = await fetch(`${server.baseUrl}/api/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-proxy-secret': 'wrong-secret' },
      body: JSON.stringify({ promptText: 'hello' })
    });

    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, 'Unauthorized proxy access.');
  } finally {
    await server.stop();
  }
});

test('proxy validates Gemini payload without upstream call', async () => {
  const server = await startProxy({ GEMINI_API_KEY: 'dummy-key' });
  try {
    const response = await fetch(`${server.baseUrl}/api/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promptText: '' })
    });

    const body = await response.json();
    assert.equal(response.status, 400);
    assert.match(body.error, /promptText is required/i);
  } finally {
    await server.stop();
  }
});

test('proxy validates HubSpot contacts properties query', async () => {
  const server = await startProxy({ HUBSPOT_TOKEN: 'dummy-token' });
  try {
    const response = await fetch(`${server.baseUrl}/api/hubspot/contacts?properties=valid_name,invalid-name`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /Invalid contact property name/i);
  } finally {
    await server.stop();
  }
});

test('proxy validates HubSpot email payload schema', async () => {
  const server = await startProxy({ HUBSPOT_TOKEN: 'dummy-token' });
  try {
    const response = await fetch(`${server.baseUrl}/api/hubspot/emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foo: 'bar' })
    });

    const body = await response.json();
    assert.equal(response.status, 400);
    assert.match(body.error, /properties object is required/i);
  } finally {
    await server.stop();
  }
});

test('proxy enforces rate limits per endpoint', async () => {
  const server = await startProxy({ RATE_LIMIT_GEMINI: '2' });
  try {
    const call = () => fetch(`${server.baseUrl}/api/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promptText: 'hello' })
    });

    const r1 = await call();
    const r2 = await call();
    const r3 = await call();

    assert.equal(r1.status, 500);
    assert.equal(r2.status, 500);
    assert.equal(r3.status, 429);

    const body = await r3.json();
    assert.match(body.error, /Rate limit exceeded/i);
    assert.ok(r3.headers.get('retry-after'));
    assert.ok(r3.headers.get('x-ratelimit-limit'));
  } finally {
    await server.stop();
  }
});

test('proxy rejects oversized request bodies', async () => {
  const server = await startProxy({ HUBSPOT_TOKEN: 'dummy-token', MAX_BODY_BYTES: '64' });
  try {
    const response = await fetch(`${server.baseUrl}/api/hubspot/emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'x'.repeat(1000) })
    });

    const body = await response.json();
    assert.equal(response.status, 413);
    assert.match(body.error, /exceeds max size/i);
  } finally {
    await server.stop();
  }
});
