/** @param {unknown} value */
export function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}
