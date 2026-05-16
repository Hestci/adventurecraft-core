import { CORE_ID, LEGACY_MODULE_ID } from "./constants.js";

/**
 * Read module flag with dual-read from legacy monolith namespace.
 * @param {foundry.abstract.Document} doc
 * @param {string} key
 * @returns {unknown}
 */
export function getModuleFlag(doc, key) {
  const v = doc.getFlag?.(CORE_ID, key);
  if (v !== undefined && v !== null) return v;
  return doc.getFlag?.(LEGACY_MODULE_ID, key);
}

/**
 * @param {Item} item
 * @returns {boolean}
 */
export function isRecipeItem(item) {
  return getModuleFlag(item, "isRecipe") === true;
}

/**
 * @param {Item} item
 * @returns {boolean}
 */
export function isRecipeBookItem(item) {
  return getModuleFlag(item, "isRecipeBook") === true;
}

/**
 * @param {Item} item
 * @returns {object}
 */
export function getRecipeData(item) {
  return getModuleFlag(item, "recipeData") ?? {};
}
