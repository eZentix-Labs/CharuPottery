const AuditLog = require('../models/AuditLog');

/**
 * Write an audit entry. Pass `session` to make it part of the surrounding
 * transaction. Callers must not pass secrets or full personal data.
 */
async function audit({ session, actor, action, entity, entityId, before, after, meta, req }) {
  const doc = {
    actor: actor?._id || actor,
    actorRole: actor?.role,
    action,
    entity,
    entityId,
    before,
    after,
    meta,
    ip: req?.ip,
  };
  if (session) {
    await AuditLog.create([doc], { session });
  } else {
    await AuditLog.create(doc);
  }
}

module.exports = { audit };
