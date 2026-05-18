import { CORE_ID } from "./constants.js";

export const PERMISSION_KEYS = [
  "createRecipe",
  "createBook",
  "editAnyRecipe",
  "deleteAnyRecipe",
  "viewAllRecipes",
  "importExport",
  "combineItems",
  "viewShoppingList",
];

export const PERMISSION_DEFAULTS = {
  createRecipe:    2,
  createBook:      3,
  editAnyRecipe:   3,
  deleteAnyRecipe: 3,
  viewAllRecipes:  2,
  importExport:    4,
  combineItems:    2,
  viewShoppingList: 3,
};

export const ROLE_I18N = {
  1: "ADVENTURECRAFT.Role.Player",
  2: "ADVENTURECRAFT.Role.Trusted",
  3: "ADVENTURECRAFT.Role.Assistant",
  4: "ADVENTURECRAFT.Role.Gamemaster",
};

export function getPermissionMinimum(operation) {
  const raw = game.settings.get(CORE_ID, `perm.${operation}`);
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1 && n <= 4) return n;
  return PERMISSION_DEFAULTS[operation] ?? 4;
}

export function userCan(operation) {
  return userCanForUser(game.user?.id, operation);
}

/**
 * @param {string} userId
 * @param {string} operation
 * @returns {boolean}
 */
export function userCanForUser(userId, operation) {
  const user = game.users.get(userId);
  if (!user?.active) return false;
  const minRole = getPermissionMinimum(operation);
  const role = Number(user.role);
  if (!Number.isInteger(role) || role < 1 || role > 4) return false;
  return role >= minRole;
}

export function getAllPermissions() {
  const out = {};
  for (const key of PERMISSION_KEYS) {
    const cap = key.charAt(0).toUpperCase() + key.slice(1);
    out[`can${cap}`] = userCan(key);
  }
  return out;
}

export function denyAndWarn() {
  ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.NoPermission"));
}
