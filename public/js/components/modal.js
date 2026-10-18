export const openModal = (modal) => modal.classList.add("active");
export const closeModal = (modal) => modal.classList.remove("active");

const isLocked = (modal) => modal.dataset.locked === "true";

// Backdrop click, Esc and any [data-close-modal] button close a modal unless it is locked.
export function initModals() {
  document.addEventListener("click", (event) => {
    const modal = event.target.closest(".modal");
    if (!modal || isLocked(modal)) return;
    if (event.target === modal || event.target.closest("[data-close-modal]")) {
      closeModal(modal);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = [...document.querySelectorAll(".modal.active")].pop();
    if (open && !isLocked(open)) closeModal(open);
  });
}
