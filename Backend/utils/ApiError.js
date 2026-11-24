class ApiError extends Error {
  /**
   * @param {string} message  safe, user-facing message
   * @param {number} statusCode
   * @param {{code?: string, details?: any}} [extra] machine-readable code and
   *        safe details (e.g. a refreshed price quote) for the client
   */
  constructor(message, statusCode, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    if (extra.code) this.code = extra.code;
    if (extra.details !== undefined) this.details = extra.details;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
