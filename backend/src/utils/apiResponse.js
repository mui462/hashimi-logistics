export function sendSuccess(res, { data = {}, message = 'OK', statusCode = 200 } = {}) {
  return res.status(statusCode).json({ success: true, data, message });
}
