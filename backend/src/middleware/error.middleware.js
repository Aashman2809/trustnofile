export class AppError extends Error {

  // function Object() { [native code] }
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
// Returns the not found response.
export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found', requestId: req.id } });
}
// Converts application errors into HTTP responses.
export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  console.error(`[${req.id}]`, err.code || 'INTERNAL', err.message);
  res.status(status).json({ error: {
    code: err.code || 'INTERNAL_ERROR',
    message: status === 500 ? 'Unexpected internal error' : err.message,
    requestId: req.id } });
}
