class ApiError extends Error {
  constructor(
    statusCode,
    msg = "Something went wrong",
    error = [],
    stack = "",
  ) {
    super(msg);
    ((this.statusCode = statusCode), (this.data = null));
    this.success = false;
    this.msg = msg;
    this.error = error;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export { ApiError };
