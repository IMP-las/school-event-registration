import { session } from "./session.js";
import { initModals } from "../components/modal.js";
import { mountNavbar } from "../components/navbar.js";
import { createSettings } from "../components/settings.js";

// Shared startup for every dashboard: guard the route, mount the navbar and
// settings, and force a password change for accounts still on a temporary one.
export async function startDashboard({ role, title, icon }) {
  const user = session.require(role);
  if (!user) return null;

  initModals();
  const navbar = mountNavbar({ title, icon, user, onSettings: () => settings.open() });
  const settings = createSettings({ onUpdate: (updated) => navbar.setName(updated.fullName) });

  if (user.mustChangePassword) await settings.requirePasswordChange();
  return session.get();
}
