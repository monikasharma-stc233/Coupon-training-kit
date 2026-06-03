import { errorHandler } from '../../src/middleware/errorHandler.js';
import { AppError } from '../../src/utils/errors.js';

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler middleware', () => {
  const req = {};
  const next = jest.fn();

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the AppError statusCode and structured error body', () => {
    const res = mockRes();
    const err = new AppError(404, 'COUPON_NOT_FOUND', 'No coupon found with the given code');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'COUPON_NOT_FOUND', message: 'No coupon found with the given code' },
    });
  });

  it('handles a 400 AppError correctly', () => {
    const res = mockRes();
    const err = new AppError(400, 'MISSING_REQUIRED_FIELD', 'Missing required field: code');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'MISSING_REQUIRED_FIELD', message: 'Missing required field: code' },
    });
  });

  it('handles a 422 AppError correctly', () => {
    const res = mockRes();
    const err = new AppError(422, 'COUPON_EXPIRED', 'This coupon has expired');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'COUPON_EXPIRED', message: 'This coupon has expired' },
    });
  });

  it('handles malformed JSON SyntaxError as 400 INVALID_JSON', () => {
    const res = mockRes();
    const err = Object.assign(new SyntaxError('Unexpected token'), {
      status: 400,
      body: true,
    });

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_JSON', message: 'Request body contains malformed JSON' },
    });
  });

  it('handles MongoDB duplicate key error (code 11000) as 409', () => {
    const res = mockRes();
    const err = { code: 11000 };

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'DUPLICATE_KEY',
        message: 'A document with a duplicate key already exists',
      },
    });
  });

  it('falls through to 500 for unrecognised errors', () => {
    const res = mockRes();
    const err = new Error('Something exploded');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
    });
  });

  it('does not treat a regular SyntaxError without body as malformed JSON', () => {
    const res = mockRes();
    const err = new SyntaxError('Some other syntax error');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
