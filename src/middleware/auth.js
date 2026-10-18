const supabase = require("../config/supabase");
const HttpError = require("../utils/httpError");
const asyncHandler = require("../utils/asyncHandler");

/*
 * Single place where "who is calling?" is decided.
 * Right now the client sends its user id in the `x-user-id` header and the role
 * is always read from the database (never from the request). When JWT auth is
 * added, only this file and public/js/core/api.js need to change.
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  const userId = req.get("x-user-id");
  if (!userId) {
    throw new HttpError(401, "Please log in to continue.", "AUTH_REQUIRED");
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error || !user) {
    throw new HttpError(401, "Please log in again.", "AUTH_REQUIRED");
  }

  req.user = user;
  next();
});

function requireRole(...roles) {
  return [
    requireAuth,
    (req, res, next) => {
      if (!roles.includes(req.user.role)) {
        throw new HttpError(403, "You don't have access to this action.");
      }
      if (req.user.must_change_password) {
        throw new HttpError(
          403,
          "Please set a new password before continuing.",
          "PASSWORD_CHANGE_REQUIRED",
        );
      }
      next();
    },
  ];
}

module.exports = { requireAuth, requireRole };
