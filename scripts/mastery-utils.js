import { CORE_ID, LEGACY_MODULE_ID } from "./constants.js";

export function getMasteryKey(recipe) {
  return recipe?.worldSourceId ?? recipe?.id ?? "";
}

export function isMasteryConfigActive(recipe) {
  return Boolean(
    recipe?.check?.type &&
    recipe?.mastery?.enabled === true &&
    Number(recipe.mastery.masteryThreshold) > 0,
  );
}

/**
 * Sanitize mastery tier rows: valid counts, dedupe by count (max dcReduction), sort asc,
 * drop tiers at or above masteryThreshold.
 * @returns {Array<{count: number, dcReduction: number}>|undefined}
 */
export function normalizeMasteryTiers(tiers, masteryThreshold) {
  if (!Array.isArray(tiers) || !tiers.length) return undefined;
  const th = Math.floor(Number(masteryThreshold) || 0);
  const byCount = new Map();
  for (const raw of tiers) {
    const count = Math.floor(Number(raw?.count) || 0);
    const dcReduction = Math.floor(Number(raw?.dcReduction) || 0);
    if (count < 1 || dcReduction < 0) continue;
    if (th >= 1 && count >= th) continue;
    const prev = byCount.get(count);
    if (prev === undefined || dcReduction > prev) byCount.set(count, dcReduction);
  }
  if (!byCount.size) return undefined;
  return [...byCount.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([count, dcReduction]) => ({ count, dcReduction }));
}

export function getMasteryTiers(recipe) {
  return recipe?.mastery?.tiers ?? [];
}

/**
 * @param {object} recipe
 * @param {number} count - successful craft count
 * @returns {{ count: number, dcReduction: number, tierIndex: number }|null}
 */
export function getActiveMasteryTier(recipe, count) {
  const tiers = getMasteryTiers(recipe);
  if (!tiers.length) return null;
  let active = null;
  let tierIndex = -1;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (count >= t.count) {
      active = t;
      tierIndex = i;
    }
  }
  if (!active) return null;
  return { count: active.count, dcReduction: active.dcReduction, tierIndex };
}

export function getMasteryDcReduction(actor, recipe) {
  if (!isMasteryConfigActive(recipe)) return 0;
  if (isMasteryGuaranteed(actor, recipe)) return 0;
  const { count } = getMasteryProgress(actor, recipe);
  const active = getActiveMasteryTier(recipe, count);
  return active?.dcReduction ?? 0;
}

export function getEffectiveCraftDc(actor, recipe) {
  const baseDc = Math.floor(Number(recipe?.check?.dc));
  if (!recipe?.check?.type || !Number.isFinite(baseDc)) return null;
  const reduction = actor ? getMasteryDcReduction(actor, recipe) : 0;
  return Math.max(1, baseDc - reduction);
}

export function getMasteryDisplay(actor, recipe) {
  const threshold = Number(recipe?.mastery?.masteryThreshold) || 0;
  const { count } = actor ? getMasteryProgress(actor, recipe) : { count: 0 };
  const isMaster = isMasteryConfigActive(recipe) && count >= threshold;
  const active = getActiveMasteryTier(recipe, count);
  const dcReduction = isMaster ? 0 : (active?.dcReduction ?? 0);
  const baseDc = Math.floor(Number(recipe?.check?.dc));
  const effectiveDc = Number.isFinite(baseDc)
    ? Math.max(1, baseDc - dcReduction)
    : null;
  return {
    count,
    threshold,
    dcReduction,
    effectiveDc,
    baseDc: Number.isFinite(baseDc) ? baseDc : null,
    tierIndex: active?.tierIndex ?? -1,
    isMaster,
  };
}

function _getMasteryMap(actor) {
  const core = actor.getFlag(CORE_ID, "craftingMastery");
  if (core && typeof core === "object") return core;
  return actor.getFlag(LEGACY_MODULE_ID, "craftingMastery") ?? {};
}

export function getMasteryProgress(actor, recipe) {
  const key = getMasteryKey(recipe);
  if (!actor || !key) return { count: 0 };
  const all = _getMasteryMap(actor);
  const entry = all[key];
  return { count: Number(entry?.count) || 0 };
}

export function masteryAllowsCritRoll(recipe) {
  return recipe?.mastery?.allowCritRoll === true;
}

export function isMasteryGuaranteed(actor, recipe) {
  if (!recipe?.check?.type) return false;
  if (!isMasteryConfigActive(recipe)) return false;
  const th = Number(recipe.mastery.masteryThreshold);
  const { count } = getMasteryProgress(actor, recipe);
  return count >= th;
}

export async function incrementMasteryCount(actor, recipe) {
  if (!isMasteryConfigActive(recipe)) return;
  const key = getMasteryKey(recipe);
  if (!actor || !key) return;
  const current = foundry.utils.deepClone(_getMasteryMap(actor));
  const prev = Number(current[key]?.count) || 0;
  current[key] = { count: prev + 1 };
  await actor.setFlag(CORE_ID, "craftingMastery", current);
}
