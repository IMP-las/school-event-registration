const HttpError = require("../utils/httpError");

function notFound(req, res, next) {
  next(new HttpError(404, "Not found"));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res
      .status(err.status)
      .json({ success: false, message: err.message, code: err.code });
  }
  console.error("Unhandled error:", err);
  res
    .status(500)
    .json({ success: false, message: "Something went wrong. Please try again." });
}

module.exports = { notFound, errorHandler };
