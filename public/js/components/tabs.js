// Markup: buttons with [data-tab="x"] and panels with [data-tab-panel="x"] inside `root`.
export function initTabs(root, { onChange } = {}) {
  const buttons = [...root.querySelectorAll("[data-tab]")];
  const panels = [...root.querySelectorAll("[data-tab-panel]")];

  function select(name) {
    buttons.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    panels.forEach((p) => p.classList.toggle("hidden", p.dataset.tabPanel !== name));
    if (onChange) onChange(name);
  }

  buttons.forEach((b) => b.addEventListener("click", () => select(b.dataset.tab)));
  select(buttons[0].dataset.tab);

  return { select };
}
