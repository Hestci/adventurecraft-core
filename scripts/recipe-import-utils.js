import { CORE_ID, LEGACY_MODULE_ID } from "./constants.js";
import { normalizeMasteryTiers } from "./mastery-utils.js";
import { normalizePoolEntry } from "./crit-pool.js";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_RECIPES = 1000;
const MAX_INGREDIENTS = 64;
const MAX_RESULT_JSON_CHARS = 65536;
const MAX_SYSTEM_DEPTH = 8;

const CHECK_STRING_KEYS = new Set([
  "type", "key", "toolName", "toolImg", "toolIdentifier", "fallbackType", "fallbackKey",
]);
const CHECK_BOOL_KEYS = new Set(["consumeOnFail", "allowWithoutTool"]);
const CRIT_SUCCESS_KEYS = new Set([
  "type", "qty", "property", "mode", "value", "damageFormula", "damageType",
  "propertyKey", "presentCount", "label",
]);
const RESULT_TOP_KEYS = new Set(["name", "type", "img", "quantity", "system", "flags"]);
const FLAG_MODULE_IDS = new Set([CORE_ID, LEGACY_MODULE_ID]);

/**
 * @param {string} text
 * @returns {object[]}
 */
export function parseRecipeImportJson(text) {
  if (typeof text !== "string" || text.length > MAX_IMPORT_BYTES) {
    throw new Error("Import file too large");
  }
  const data = JSON.parse(text);
  const rawList = Array.isArray(data) ? data : Object.values(data ?? {});
  if (!Array.isArray(rawList) || rawList.length > MAX_IMPORT_RECIPES) {
    throw new Error("Too many recipes in import file");
  }
  return rawList.map(sanitizeImportedRecipe).filter(Boolean);
}

/** @param {unknown} raw */
function sanitizeImportedRecipe(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (Object.prototype.hasOwnProperty.call(raw, "__proto__")) return null;
  if (Object.prototype.hasOwnProperty.call(raw, "constructor")) return null;

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;

  const recipe = {
    name: name.slice(0, 256),
    ingredients: sanitizeIngredients(raw.ingredients),
    critQualityNames: raw.critQualityNames === true,
  };

  const category = raw.category != null ? String(raw.category).trim() : "";
  if (category) recipe.category = category.slice(0, 128);

  if (raw.bookId) recipe.bookId = String(raw.bookId).slice(0, 64);

  const check = sanitizeCheck(raw.check);
  if (check) recipe.check = check;

  const result = sanitizeResult(raw.result);
  if (result) recipe.result = result;

  const mastery = sanitizeMastery(raw.mastery);
  if (mastery) recipe.mastery = mastery;

  return recipe;
}

/** @param {unknown} checkRaw */
function sanitizeCheck(checkRaw) {
  if (!checkRaw || typeof checkRaw !== "object" || Array.isArray(checkRaw)) return null;
  const out = {};
  for (const key of CHECK_STRING_KEYS) {
    if (checkRaw[key] != null && checkRaw[key] !== "") {
      out[key] = String(checkRaw[key]).slice(0, 256);
    }
  }
  for (const key of CHECK_BOOL_KEYS) {
    if (key in checkRaw) out[key] = checkRaw[key] !== false;
  }
  if (checkRaw.dc != null) {
    out.dc = Math.max(1, Math.min(50, Math.floor(Number(checkRaw.dc) || 15)));
  }
  if (checkRaw.critThreshold != null) {
    out.critThreshold = Math.max(1, Math.min(30, Math.floor(Number(checkRaw.critThreshold) || 5)));
  }
  const cs = sanitizeCritSuccess(checkRaw.critSuccess);
  if (cs) out.critSuccess = cs;
  if (!out.type) return null;
  return out;
}

/** @param {unknown} csRaw */
function sanitizeCritSuccess(csRaw) {
  if (!csRaw || typeof csRaw !== "object" || Array.isArray(csRaw)) return null;
  const out = {};
  for (const key of CRIT_SUCCESS_KEYS) {
    if (!(key in csRaw)) continue;
    if (key === "qty" || key === "value" || key === "presentCount") {
      out[key] = Number(csRaw[key]) || 0;
    } else if (key === "damageType") {
      out.damageType = String(csRaw[key]).slice(0, 64);
    } else {
      out[key] = String(csRaw[key]).slice(0, 512);
    }
  }
  if (Array.isArray(csRaw.damageTypes)) {
    out.damageTypes = csRaw.damageTypes.map(String).filter(Boolean).slice(0, 16);
  }
  if (csRaw.type === "pool" && Array.isArray(csRaw.options)) {
    out.type = "pool";
    out.options = csRaw.options
      .map(o => normalizePoolEntry(o))
      .filter(Boolean)
      .slice(0, 32);
    if (!out.options.length) return null;
    if (csRaw.sizeRoll && typeof csRaw.sizeRoll === "object") {
      const sr = csRaw.sizeRoll;
      const formula = sr.formula != null ? String(sr.formula).slice(0, 64) : "";
      const table = Array.isArray(sr.table)
        ? sr.table.slice(0, 32).map(row => ({
          min: Number(row?.min) || 0,
          max: Number(row?.max) || 0,
          count: Math.max(1, Math.floor(Number(row?.count) || 1)),
        }))
        : [];
      if (formula || table.length) out.sizeRoll = { ...(formula ? { formula } : {}), ...(table.length ? { table } : {}) };
    }
  }
  if (!out.type) out.type = "qty";
  return out;
}

/** @param {unknown} resultRaw */
function sanitizeResult(resultRaw) {
  if (!resultRaw || typeof resultRaw !== "object" || Array.isArray(resultRaw)) return null;
  const out = {};
  for (const key of RESULT_TOP_KEYS) {
    if (!(key in resultRaw)) continue;
    if (key === "name" || key === "type" || key === "img") {
      out[key] = String(resultRaw[key]).slice(0, 512);
    } else if (key === "quantity") {
      out.quantity = Math.max(1, Math.min(9999, Math.floor(Number(resultRaw.quantity) || 1)));
    } else if (key === "system") {
      const pruned = pruneValue(resultRaw.system, 0);
      if (pruned !== undefined) out.system = pruned;
    } else if (key === "flags") {
      out.flags = sanitizeResultFlags(resultRaw.flags);
    }
  }
  const size = JSON.stringify(out).length;
  if (size > MAX_RESULT_JSON_CHARS) {
    throw new Error("Import result payload too large");
  }
  return Object.keys(out).length ? out : null;
}

/** @param {unknown} flagsRaw */
function sanitizeResultFlags(flagsRaw) {
  if (!flagsRaw || typeof flagsRaw !== "object" || Array.isArray(flagsRaw)) return undefined;
  const out = {};
  for (const modId of FLAG_MODULE_IDS) {
    if (!(modId in flagsRaw) || typeof flagsRaw[modId] !== "object") continue;
    const mod = flagsRaw[modId];
    if (!mod || Array.isArray(mod)) continue;
    const picked = {};
    if (mod.recipeId != null) picked.recipeId = String(mod.recipeId).slice(0, 64);
    if (Object.keys(picked).length) out[modId] = picked;
  }
  return Object.keys(out).length ? out : undefined;
}

/** @param {unknown} value @param {number} depth */
function pruneValue(value, depth) {
  if (depth > MAX_SYSTEM_DEPTH) return undefined;
  if (value === null || value === undefined) return value;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 4096);
  if (Array.isArray(value)) {
    return value.slice(0, 128).map(v => pruneValue(v, depth + 1)).filter(v => v !== undefined);
  }
  if (typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "__proto__")) return undefined;
    const out = {};
    let count = 0;
    for (const [k, v] of Object.entries(value)) {
      if (count >= 128) break;
      if (k === "__proto__" || k === "constructor") continue;
      const pruned = pruneValue(v, depth + 1);
      if (pruned !== undefined) {
        out[k] = pruned;
        count++;
      }
    }
    return out;
  }
  return undefined;
}

/** @param {unknown} masteryRaw */
function sanitizeMastery(masteryRaw) {
  if (!masteryRaw || typeof masteryRaw !== "object" || Array.isArray(masteryRaw)) return null;
  if (masteryRaw.enabled !== true) return null;
  const th = Math.floor(Number(masteryRaw.masteryThreshold) || 0);
  if (th < 1) return null;
  const tiers = normalizeMasteryTiers(masteryRaw.tiers, th);
  return {
    enabled: true,
    masteryThreshold: th,
    allowCritRoll: masteryRaw.allowCritRoll === true,
    ...(tiers?.length ? { tiers } : {}),
  };
}

/** @param {unknown} ings */
function sanitizeIngredients(ings) {
  if (!Array.isArray(ings)) return [];
  return ings.slice(0, MAX_INGREDIENTS).map((ing) => {
    if (!ing || typeof ing !== "object" || Array.isArray(ing)) return null;
    const ingName = typeof ing.name === "string" ? ing.name.trim() : "";
    if (!ingName) return null;
    const out = {
      name: ingName.slice(0, 256),
      quantity: Math.max(1, Math.min(9999, Number(ing.quantity) || 1)),
    };
    if (Array.isArray(ing.tags)) {
      out.tags = ing.tags.map(String).filter(Boolean).slice(0, 16);
    }
    if (ing.img) out.img = String(ing.img).slice(0, 512);
    if (ing.uuid) out.uuid = String(ing.uuid).slice(0, 256);
    return out;
  }).filter(Boolean);
}
