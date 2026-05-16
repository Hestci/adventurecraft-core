/** @typedef {object} SystemAdapter */

/** @type {SystemAdapter|null} */
let _adapter = null;

/**
 * @param {SystemAdapter} adapter
 */
export function registerSystemAdapter(adapter) {
  if (!adapter?.id) throw new Error("AdventureCraft Core | SystemAdapter requires id");
  _adapter = adapter;
}

/**
 * @returns {SystemAdapter}
 */
export function getAdapter() {
  if (!_adapter) {
    throw new Error(
      "AdventureCraft Core | No system adapter registered. Enable a bridge module (e.g. adventurecraft-dnd5e).",
    );
  }
  return _adapter;
}

/** @returns {boolean} */
export function hasAdapter() {
  return _adapter != null;
}
