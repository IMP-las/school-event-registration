// Renders "Showing 1–20 of 85" with Previous / Next into `element`.
export function renderPager(element, { page, pageSize, total }, onPageChange) {
  if (total <= pageSize) {
    element.innerHTML = "";
    return;
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const lastPage = Math.ceil(total / pageSize);

  element.innerHTML = `
    <span class="pager-info">Showing ${from}–${to} of ${total}</span>
    <div class="pager-buttons">
      <button class="btn-small btn-secondary" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Previous</button>
      <button class="btn-small btn-secondary" data-page="${page + 1}" ${page >= lastPage ? "disabled" : ""}>Next</button>
    </div>`;

  element.onclick = (event) => {
    const button = event.target.closest("[data-page]");
    if (button && !button.disabled) onPageChange(Number(button.dataset.page));
  };
}
