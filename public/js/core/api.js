import { session } from "./session.js";

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body) {
  const user = session.get();
  const headers = { "Content-Type": "application/json" };
  // Placeholder identity header; replace with an Authorization token when JWT is added.
  if (user) headers["x-user-id"] = user.userId;

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Cannot connect to the server.", 0);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && user) session.logout();
    throw new ApiError(data.message || "Request failed", response.status, data.code);
  }
  return data;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body = {}) => request("POST", path, body),
  put: (path, body = {}) => request("PUT", path, body),
  patch: (path, body = {}) => request("PATCH", path, body),
  delete: (path) => request("DELETE", path),
};
