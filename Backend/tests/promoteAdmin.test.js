const { connectReplSet, connectStandalone, clearDb, disconnect } = require('./helpers/db');
const { createUser } = require('./helpers/fixtures');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { changeRole, mongoHosts, isLocalHosts, maskEmail, parseArgs } = require('../scripts/promote-admin');

describe('scripts/promote-admin — helpers', () => {
  it('extracts hosts without credentials, path or options', () => {
    expect(mongoHosts('mongodb+srv://u:p%40ss@cluster0.abc.mongodb.net/db?retryWrites=true')).toBe('cluster0.abc.mongodb.net');
    expect(mongoHosts('mongodb://u:p@h1:27017,h2:27017/db?replicaSet=rs0')).toBe('h1:27017,h2:27017');
    expect(mongoHosts('mongodb://localhost:27017/db')).toBe('localhost:27017');
  });
  it('only treats loopback hosts as local', () => {
    expect(isLocalHosts('localhost:27017')).toBe(true);
    expect(isLocalHosts('127.0.0.1')).toBe(true);
    expect(isLocalHosts('localhost.evil.com')).toBe(false);
    expect(isLocalHosts('localhost:27017,db.example.com')).toBe(false);
  });
  it('masks emails', () => {
    expect(maskEmail('owner@example.com')).toBe('ow***@example.com');
  });
  it('rejects unknown arguments (no arbitrary --role)', () => {
    expect(() => parseArgs(['--email=a@b.co', '--role=artisan'])).toThrow(/Unknown argument: --role/);
  });
});

describe('scripts/promote-admin — changeRole (replica set)', () => {
  beforeAll(connectReplSet);
  afterAll(disconnect);
  beforeEach(clearDb);

  it('dry run changes nothing', async () => {
    const { user } = await createUser('user');
    const r = await changeRole({ email: user.email, mode: 'promote', apply: false });
    expect(r.status).toBe('dry-run');
    expect((await User.findById(user._id)).role).toBe('user');
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('promotes exactly one user and writes an audit entry', async () => {
    const { user } = await createUser('user');
    const { user: other } = await createUser('user');
    const before = await User.findById(user._id).select('+password');
    const r = await changeRole({ email: user.email.toUpperCase(), mode: 'promote', apply: true, reason: 'first admin test', operator: 'ci@test' });
    expect(r.status).toBe('applied');
    const after = await User.findById(user._id).select('+password');
    expect(after.role).toBe('admin');
    expect(after.password).toBe(before.password);
    expect(after.tokenVersion).toBe(before.tokenVersion);
    expect((await User.findById(other._id)).role).toBe('user');
    const logs = await AuditLog.find().lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'user.role.promote', entity: 'User', before: { role: 'user' }, after: { role: 'admin' } });
    expect(String(logs[0].entityId)).toBe(String(user._id));
    expect(JSON.stringify(logs[0])).not.toMatch(/password|token|\$2[aby]\$/i);
  });

  it('requires a reason when applying', async () => {
    const { user } = await createUser('user');
    await expect(changeRole({ email: user.email, mode: 'promote', apply: true })).rejects.toThrow(/--reason/);
    expect((await User.findById(user._id)).role).toBe('user');
  });

  it('is a no-op for an existing admin', async () => {
    const { user } = await createUser('admin');
    const r = await changeRole({ email: user.email, mode: 'promote', apply: true, reason: 'repeat run' });
    expect(r.status).toBe('noop');
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('refuses unknown users, other roles and deactivated accounts', async () => {
    await expect(changeRole({ email: 'nobody@example.test', mode: 'promote', apply: true, reason: 'x test' })).rejects.toThrow(/No user found/);
    const { user: artisan } = await createUser('artisan');
    await expect(changeRole({ email: artisan.email, mode: 'promote', apply: true, reason: 'x test' })).rejects.toThrow(/only 'user' -> 'admin'/);
    const { user: inactive } = await createUser('user', { isActive: false });
    await expect(changeRole({ email: inactive.email, mode: 'promote', apply: true, reason: 'x test' })).rejects.toThrow(/deactivated/);
    await expect(changeRole({ email: 'not-an-email', mode: 'promote', apply: false })).rejects.toThrow(/valid --email/);
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('revert demotes, revokes refresh tokens, audits, and protects the last admin', async () => {
    const { user: a1 } = await createUser('admin');
    await expect(changeRole({ email: a1.email, mode: 'revert', apply: true, reason: 'rollback test' })).rejects.toThrow(/last active admin/);
    await createUser('admin');
    const tv = (await User.findById(a1._id)).tokenVersion;
    const r = await changeRole({ email: a1.email, mode: 'revert', apply: true, reason: 'rollback test' });
    expect(r.status).toBe('applied');
    const after = await User.findById(a1._id);
    expect(after.role).toBe('user');
    expect(after.tokenVersion).toBe(tv + 1);
    expect(await AuditLog.countDocuments({ action: 'user.role.revert' })).toBe(1);
  });
});

describe('scripts/promote-admin — standalone database', () => {
  beforeAll(connectStandalone);
  afterAll(disconnect);

  it('refuses to apply without transaction support', async () => {
    const { user } = await createUser('user');
    await expect(changeRole({ email: user.email, mode: 'promote', apply: true, reason: 'no replset' })).rejects.toThrow(/replica set/);
    expect((await User.findById(user._id)).role).toBe('user');
  });
});
