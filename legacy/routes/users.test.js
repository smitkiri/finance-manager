const request = require('supertest');
const { app } = require('../tests/setup/testApp');
const { pool, cleanAllTables } = require('../tests/setup/testDb');
const { insertUser } = require('../tests/setup/fixtures');

afterEach(async () => {
  await cleanAllTables();
});

describe('GET /api/users', () => {
  it('returns default user when no users exist', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].id).toBe('default-user');
    expect(res.body.users[0].name).toBe('Default');
  });

  it('returns saved users when they exist', async () => {
    await insertUser(pool, { id: 'user-1', name: 'Alice' });
    await insertUser(pool, { id: 'user-2', name: 'Bob' });

    const res = await request(app).get('/api/users');
    expect(res.body.users).toHaveLength(2);
    expect(res.body.users[0].name).toBe('Alice');
    expect(res.body.users[1].name).toBe('Bob');
  });

  it('returns users with camelCase fields', async () => {
    await insertUser(pool, { id: 'user-1', name: 'Alice' });

    const res = await request(app).get('/api/users');
    expect(res.body.users[0]).toHaveProperty('id');
    expect(res.body.users[0]).toHaveProperty('name');
    expect(res.body.users[0]).toHaveProperty('createdAt');
  });
});

describe('POST /api/users', () => {
  it('bulk replaces all users', async () => {
    await insertUser(pool, { id: 'old-user', name: 'Old' });

    const res = await request(app)
      .post('/api/users')
      .send({
        users: [
          { id: 'new-1', name: 'New1' },
          { id: 'new-2', name: 'New2' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);

    const check = await request(app).get('/api/users');
    expect(check.body.users).toHaveLength(2);
    expect(check.body.users.map((u) => u.name).sort()).toEqual(['New1', 'New2']);
  });

  it('handles empty users array', async () => {
    const res = await request(app).post('/api/users').send({ users: [] });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });
});
