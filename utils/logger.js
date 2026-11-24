/**
 * Minimal structured logger. Log identifiers (order ids, event types), never
 * personal data, tokens, credentials or full provider payloads.
 */
const silent = () => process.env.NODE_ENV === 'test' && process.env.LOG_IN_TESTS !== 'true';

function write(level, msg, fields) {
  if (silent()) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(fields || {}) });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

module.exports = {
  info: (msg, f) => write('info', msg, f),
  warn: (msg, f) => write('warn', msg, f),
  error: (msg, f) => write('error', msg, f),
};
