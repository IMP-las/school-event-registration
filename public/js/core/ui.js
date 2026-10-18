const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Every piece of user-supplied text must go through this before touching innerHTML.
export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

export const $ = (selector, root = document) => root.querySelector(selector);

export function toast(message, type = "success") {
  let stack = $("#toastStack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toastStack";
    stack.className = "toast-stack";
    stack.setAttribute("aria-live", "polite");
    document.body.append(stack);
  }

  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.textContent = message;
  stack.append(item);
  setTimeout(() => item.remove(), 3500);
}

export function showMessage(element, message, type = "error") {
  element.className = message ? `message ${type}` : "";
  element.textContent = message;
}

export function setBusy(button, isBusy, busyLabel) {
  if (isBusy) button.dataset.label = button.textContent;
  button.disabled = isBusy;
  button.textContent = isBusy ? busyLabel : button.dataset.label;
}

export const emptyState = (message) => `<div class="empty-state">${esc(message)}</div>`;

function delegate(root, eventName, attribute, handlers) {
  root.addEventListener(eventName, (event) => {
    const target = event.target.closest(`[${attribute}]`);
    if (!target || !root.contains(target)) return;
    const handler = handlers[target.getAttribute(attribute)];
    if (handler) handler(target, event);
  });
}

// <button data-action="edit" data-id="7"> → onClick(root, { edit: (el) => ... })
export const onClick = (root, handlers) => delegate(root, "click", "data-action", handlers);
export const onChange = (root, handlers) => delegate(root, "change", "data-change", handlers);

export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export async function run(task, fallbackMessage) {
  try {
    return await task();
  } catch (error) {
    toast(error.message || fallbackMessage, "error");
    return undefined;
  }
}
