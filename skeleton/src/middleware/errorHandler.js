
export function errorHandler(err, _req, res, _next) {
  if (err.isAppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
  }

  // Express built-in: malformed JSON body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body contains malformed JSON' },
    });
  }

  // Unhandled MongoDB duplicate key (safety net; most are handled per-controller)
  if (err.code === 11000) {
    return res.status(409).json({
      error: { code: 'DUPLICATE_KEY', message: 'A document with a duplicate key already exists' },
    });
  }

  // Unknown / unexpected errors
  console.error('Unhandled error:', JSON.stringify(err.data || err));
  return res.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
  });
}
