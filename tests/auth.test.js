const express = require('express');
const request = require('supertest');

/**
 * Test the API key authentication middleware from server.js.
 * We recreate the middleware here to test it in isolation, since
 * server.js also starts the server and runs migrations.
 */
function createAppWithAuth(apiSecret) {
  const app = express();
  app.use(express.json());

  // Replicate the auth middleware from server.js
  app.use('/api', (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (!apiSecret || key === apiSecret) return next();
    res.status(401).json({ error: 'Unauthorized' });
  });

  app.get('/api/test', (req, res) => {
    res.json({ success: true });
  });

  return app;
}

describe('Auth middleware', () => {
  it('allows all requests when API_SECRET is not set', async () => {
    const app = createAppWithAuth(undefined);

    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('allows all requests when API_SECRET is empty string', async () => {
    const app = createAppWithAuth('');

    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
  });

  it('rejects requests without API key when API_SECRET is set', async () => {
    const app = createAppWithAuth('my-secret-key');

    const res = await request(app).get('/api/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('rejects requests with wrong API key', async () => {
    const app = createAppWithAuth('my-secret-key');

    const res = await request(app).get('/api/test').set('x-api-key', 'wrong-key');

    expect(res.status).toBe(401);
  });

  it('allows requests with correct API key', async () => {
    const app = createAppWithAuth('my-secret-key');

    const res = await request(app).get('/api/test').set('x-api-key', 'my-secret-key');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
