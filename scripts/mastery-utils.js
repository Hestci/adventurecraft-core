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
