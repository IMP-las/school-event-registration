const STORAGE_KEY = "user";

export const session = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  },

  set(user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },

  logout() {
    session.clear();
    window.location.href = "index.html";
  },

  // Returns the logged-in user if they have the given role, otherwise redirects to login.
  require(role) {
    const user = session.get();
    if (!user || user.role !== role) {
      window.location.href = "index.html";
      return null;
    }
    return user;
  },
};
