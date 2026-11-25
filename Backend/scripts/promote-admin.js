/**
 * Promote ONE existing, active user to `admin` by email, or revert that
 * promotion. Intended for bootstrapping the first production admin.
 *
 *   # 1. Dry run (default): shows what would change, writes nothing
 *   node scripts/promote-admin.js --email=owner@example.com
 *
 *   # 2. Apply: every confirmation flag is required
 *   node scripts/promote-admin.js --email=owner@example.com --apply \
 *     --confirm-email=owner@example.com --i-understand-target=<db-host> \
 *     --reason="First production admin, approved by <name>"
 *
 *   # Rollback: admin -> user (same flags, plus --revert)
 *   node scripts/promote-admin.js --email=owner@example.com --revert --apply ...
 *
 * Safety properties:
 *   - Only two transitions exist: user -> admin (promote), admin -> user
 *     (revert). No other role can be set or replaced ('artisan' is refused).
 *   - Updates exactly one document, matched by _id AND its expected current
 *     role (compare-and-set), inside a majority-acknowledged transaction
 *     together with an AuditLog entry, so the change and its audit record
 *     commit or fail together. Requires a replica set (Atlas is one).
 *   - Never deletes anything, never creates users, never touches passwords.
 *   - Revert increments tokenVersion (revokes refresh tokens) and refuses to
 *     remove the last active admin.
 *   - Never prints MONGO_URI, credentials, password hashes or tokens; the
 *     email is masked in output.
 *   - Non-local databases require --i-understand-target=<exact host>.
 */
require('dotenv').config();
const os = require('os');
const mongoose = require('mongoose');

const ROLE_FROM = { promote: 'user', revert: 'admin' };
const ROLE_TO = { promote: 'admin', revert: 'user' };
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,24}$/;

function parseArgs(argv) {
  const out = { apply: false, revert: false };
  for (const a of argv) {
    if (a === '--apply') out.apply = true;
    else if (a === '--revert') out.revert = true;
    else if (a.startsWith('--email=')) out.email = a.slice(8);
    else if (a.startsWith('--confirm-email=')) out.confirmEmail = a.slice(16);
    else if (a.startsWith('--i-understand-target=')) out.target = a.slice(22);
    else if (a.startsWith('--reason=')) out.reason = a.slice(9);
    else throw new Error(`Unknown argument: ${a.split('=')[0]}`);
  }
  return out;
}

/** Host list of a MongoDB URI, without scheme, credentials, path or options. */
function mongoHosts(uri) {
  return String(uri || '')
    .replace(/^mongodb(\+srv)?:\/\//, '')
    .replace(/^[^@/]*@/, '')
    .split(/[/?]/)[0];
}

function isLocalHosts(hosts) {
  return hosts.split(',').every((h) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(h));
}

function maskEmail(email) {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}

/**
 * Core operation (exported for tests). Assumes mongoose is connected.
 * @returns {{status: 'dry-run'|'applied'|'noop', userId, from, to}}
 */
async function changeRole({ email, mode, apply, reason, operator }) {
  const User = require('../models/User');
  const { audit } = require('../services/audit');
  const { withTransaction, transactionsSupported } = require('../utils/withTransaction');

  if (!['promote', 'revert'].includes(mode)) throw new Error('Invalid mode');
  const target = normEmail(email);
  if (!EMAIL_RE.test(target)) throw new Error('A valid --email is required.');
  const from = ROLE_FROM[mode];
  const to = ROLE_TO[mode];

  const matches = await User.find({ email: target }).select('_id role isActive').lean();
  if (matches.length === 0) throw new Error(`No user found with email ${maskEmail(target)}. They must register first.`);
  if (matches.length > 1) throw new Error('More than one user matches this email; refusing.');
  const user = matches[0];

  if (user.role === to) return { status: 'noop', userId: String(user._id), from: user.role, to };
  if (user.role !== from) throw new Error(`User has role '${user.role}'; only '${from}' -> '${to}' is allowed.`);
  if (user.isActive === false) throw new Error('User account is deactivated; refusing.');

  if (mode === 'revert') {
    const otherAdmins = await User.countDocuments({ role: 'admin', isActive: { $ne: false }, _id: { $ne: user._id } });
    if (otherAdmins === 0) throw new Error('Refusing to remove the last active admin.');
  }

  if (!apply) return { status: 'dry-run', userId: String(user._id), from, to };

  if (!reason || reason.trim().length < 5) throw new Error('--reason="<why and who approved>" is required with --apply.');
  if (!(await transactionsSupported())) throw new Error('Database is not a replica set; transactions are required. Refusing.');

  await withTransaction(async (session) => {
    const update = mode === 'revert'
      ? { $set: { role: to }, $inc: { tokenVersion: 1 } }
      : { $set: { role: to } };
    const res = await User.updateOne({ _id: user._id, role: from }, update, { session });
    if (res.matchedCount !== 1) throw new Error('User changed concurrently; nothing was modified. Re-run the dry run.');
    await audit({
      session,
      action: mode === 'promote' ? 'user.role.promote' : 'user.role.revert',
      entity: 'User',
      entityId: user._id,
      before: { role: from },
      after: { role: to },
      meta: { via: 'scripts/promote-admin.js', reason: reason.trim().slice(0, 300), operator: operator || null },
    });
  });
  return { status: 'applied', userId: String(user._id), from, to };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.revert ? 'revert' : 'promote';
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set.');
  const hosts = mongoHosts(uri);
  const email = normEmail(args.email);

  if (!isLocalHosts(hosts) && args.target !== hosts) {
    throw new Error(`Refusing to run against ${hosts}. Pass --i-understand-target=${hosts} to confirm the target database.`);
  }
  if (args.apply && normEmail(args.confirmEmail) !== email) {
    throw new Error('--confirm-email must repeat --email exactly when using --apply.');
  }

  console.log(`Target database: ${hosts} / ${mode} / ${args.apply ? 'APPLY' : 'dry run'}`);
  await mongoose.connect(uri);
  try {
    const operator = `${os.userInfo().username}@${os.hostname()}`;
    const r = await changeRole({ email, mode, apply: args.apply, reason: args.reason, operator });
    const who = `${maskEmail(email)} (id ${r.userId})`;
    if (r.status === 'noop') console.log(`No change: ${who} already has role '${r.to}'.`);
    else if (r.status === 'dry-run') console.log(`WOULD change ${who}: ${r.from} -> ${r.to}. Re-run with --apply --confirm-email=... --reason="..." to proceed.`);
    else console.log(`DONE: ${who}: ${r.from} -> ${r.to}. Audit entry written (action user.role.${mode}).`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    // Never echo the connection string, even if a driver error contains it.
    const uri = process.env.MONGO_URI;
    const msg = String((e && e.message) || e);
    const safe = (uri ? msg.split(uri).join('<MONGO_URI>') : msg).replace(/(mongodb(\+srv)?:\/\/)[^@\s/]+@/g, '$1<credentials>@');
    console.error(`Error: ${safe}`);
    process.exit(1);
  });
}

module.exports = { changeRole, mongoHosts, isLocalHosts, maskEmail, parseArgs };
