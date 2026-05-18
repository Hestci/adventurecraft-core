import { CORE_ID } from "./constants.js";
import { getModuleFlag } from "./flag-utils.js";
import { escapeHtml } from "./html-utils.js";
import { getMasteryDcReduction } from "./mastery-utils.js";

/**
 * @param {Roll|object} roll
 * @returns {number|null}
 */
export function extractNaturalFromRoll(roll) {
  const dice = roll?.dice;
  if (!Array.isArray(dice)) return null;
  for (const die of dice) {
    if (die.faces !== 20 || !die.results?.length) continue;
    const r = die.results[0];
    const value = typeof r === "object" ? r.result : r;
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

/**
 * @param {object} recipe
 * @param {Actor} actor
 * @returns {object}
 */
function _dcFields(recipe, actor) {
  const baseDc = recipe.check?.dc ?? 0;
  const dcReduction = getMasteryDcReduction(actor, recipe);
  const threshold = recipe.check?.critThreshold ?? 5;
  return {
    dc: Math.max(1, baseDc - dcReduction),
    baseDc,
    dcReduction,
    threshold,
  };
}

/** @returns {object} */
export function buildNoCheckMeta() {
  return {
    outcome: "none",
    total: null,
    dc: null,
    baseDc: null,
    dcReduction: 0,
    threshold: null,
    natural: null,
    isCrit: false,
    isCritFail: false,
    masteryGuaranteed: false,
  };
}

/**
 * @param {object} recipe
 * @param {Actor} actor
 * @returns {object}
 */
export function buildMasteryCheckMeta(recipe, actor) {
  const hasCheck = Boolean(recipe.check?.type);
  const dcFields = hasCheck ? _dcFields(recipe, actor) : {};
  return {
    outcome: "mastery",
    total: null,
    natural: null,
    isCrit: false,
    isCritFail: false,
    masteryGuaranteed: true,
    ...(hasCheck
      ? {
        dc: dcFields.dc,
        baseDc: dcFields.baseDc,
        dcReduction: dcFields.dcReduction,
        threshold: dcFields.threshold,
      }
      : {
        dc: null,
        baseDc: null,
        dcReduction: 0,
        threshold: null,
      }),
  };
}

/**
 * @param {object} params
 * @returns {object}
 */
export function buildRolledCheckMeta({
  roll,
  baseDc,
  threshold,
  actor,
  recipe,
  success,
  critSuccess,
  critFail,
  masteryGuaranteed = false,
}) {
  const dcReduction = getMasteryDcReduction(actor, recipe);
  const effectiveDc = Math.max(1, baseDc - dcReduction);
  let outcome = "fail";
  if (critSuccess) outcome = "crit_success";
  else if (success) outcome = "success";
  else if (critFail) outcome = "crit_fail";

  return {
    outcome,
    total: roll?.total ?? null,
    dc: effectiveDc,
    baseDc,
    dcReduction,
    threshold,
    natural: extractNaturalFromRoll(roll),
    isCrit: critSuccess,
    isCritFail: critFail,
    masteryGuaranteed: Boolean(masteryGuaranteed),
  };
}

export function isRecordCraftingOriginEnabled() {
  try {
    return game.settings.get(CORE_ID, "recordCraftingOrigin") !== false;
  } catch {
    return true;
  }
}

/**
 * @param {object} params
 * @returns {object}
 */
export function buildCraftOrigin({ actor, recipe, checkMeta, stationContext = null }) {
  return {
    crafterId: actor.id,
    crafterName: actor.name,
    craftedAt: Math.floor(Date.now() / 1000),
    recipeId: recipe.id,
    recipeName: recipe.name ?? recipe.result?.name ?? "",
    check: checkMeta,
    station: stationContext?.station ?? null,
    stationEquipment: stationContext?.stationEquipment ?? [],
    worldTime: null,
  };
}

/**
 * @param {object} resultData
 * @param {object} origin
 */
export function attachOriginToResultData(resultData, origin) {
  resultData.flags ??= {};
  resultData.flags[CORE_ID] ??= {};
  resultData.flags[CORE_ID].origin = origin;
}

/**
 * @param {Item} item
 * @returns {object|null}
 */
export function getCraftOrigin(item) {
  const raw = getModuleFlag(item, "origin");
  return raw && typeof raw === "object" ? raw : null;
}

/**
 * @param {Item} item
 * @returns {boolean}
 */
export function hasCraftOrigin(item) {
  return getCraftOrigin(item) !== null;
}

/**
 * @param {number} craftedAt seconds or ms
 * @returns {string}
 */
export function formatOriginDate(craftedAt) {
  const n = Number(craftedAt) || 0;
  if (!n) return "";
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toLocaleString(game.i18n.lang);
}

/**
 * @param {object} check
 * @returns {string}
 */
export function buildOriginCheckLine(check) {
  if (!check || typeof check !== "object") return "";

  const outcome = check.outcome ?? "none";
  if (outcome === "none") {
    return game.i18n.localize("ADVENTURECRAFT.Origin.CheckNone");
  }
  if (outcome === "mastery") {
    const dc = check.dc;
    if (dc != null) {
      return game.i18n.format("ADVENTURECRAFT.Origin.CheckMasteryWithDc", { dc });
    }
    return game.i18n.localize("ADVENTURECRAFT.Origin.CheckMastery");
  }

  const outcomeLabel = game.i18n.localize(`ADVENTURECRAFT.Origin.Outcome.${outcome}`);
  const parts = [outcomeLabel];

  if (check.total != null && check.dc != null) {
    parts.push(
      game.i18n.format("ADVENTURECRAFT.Origin.CheckRollVsDc", {
        total: check.total,
        dc: check.dc,
      }),
    );
  }
  if (check.natural != null) {
    parts.push(
      game.i18n.format("ADVENTURECRAFT.Origin.CheckNatural", { natural: check.natural }),
    );
  }
  if (check.dcReduction > 0 && check.baseDc != null) {
    parts.push(
      game.i18n.format("ADVENTURECRAFT.Origin.CheckMasteryReduction", {
        baseDc: check.baseDc,
        reduction: check.dcReduction,
      }),
    );
  }

  return parts.join(" · ");
}

/**
 * @param {object|null} station
 * @returns {string}
 */
function _buildStationBlock(station) {
  if (!station?.name) return "";
  const line = game.i18n.format("ADVENTURECRAFT.Origin.StationLine", {
    name: escapeHtml(station.name),
  });
  return `<p>${line}</p>`;
}

/** @type {RegExp} */
const ORIGIN_DESCRIPTION_BLOCK_RE =
  /<!--\s*adventurecraft-craft-origin\s*-->[\s\S]*?<\/div>\s*(?=<|$)/gi;

/**
 * @param {string} html
 * @returns {string}
 */
export function stripOriginFromDescription(html) {
  return String(html ?? "").replace(ORIGIN_DESCRIPTION_BLOCK_RE, "").trimEnd();
}

/**
 * HTML block appended to `system.description.value` (dnd5e item sheet).
 * @param {object} origin
 * @returns {string}
 */
export function buildOriginDescriptionHtml(origin) {
  if (!origin || typeof origin !== "object") return "";

  const crafter = escapeHtml(origin.crafterName ?? "—");
  const recipe = escapeHtml(origin.recipeName ?? "—");
  const date = escapeHtml(formatOriginDate(origin.craftedAt));

  let checkRow = "";
  const checkLine = buildOriginCheckLine(origin.check);
  if (checkLine) {
    checkRow = game.i18n.format("ADVENTURECRAFT.Origin.DescriptionCheckRow", {
      label: escapeHtml(game.i18n.localize("ADVENTURECRAFT.Origin.SheetCheck")),
      check: escapeHtml(checkLine),
    });
  }

  let stationRow = "";
  if (origin.station?.name) {
    stationRow = game.i18n.format("ADVENTURECRAFT.Origin.DescriptionStationRow", {
      label: escapeHtml(game.i18n.localize("ADVENTURECRAFT.Origin.SheetStation")),
      name: escapeHtml(origin.station.name),
    });
  }

  return game.i18n.format("ADVENTURECRAFT.Origin.DescriptionBlock", {
    title: escapeHtml(game.i18n.localize("ADVENTURECRAFT.Origin.SheetTitle")),
    crafterLabel: escapeHtml(game.i18n.localize("ADVENTURECRAFT.Origin.SheetCrafter")),
    crafter,
    recipeLabel: escapeHtml(game.i18n.localize("ADVENTURECRAFT.Origin.SheetRecipe")),
    recipe,
    dateLabel: escapeHtml(game.i18n.localize("ADVENTURECRAFT.Origin.SheetDate")),
    date,
    checkRow,
    stationRow,
  });
}

/**
 * Appends (or replaces) crafting-origin block on result data before Item.create.
 * @param {object} resultData
 * @param {object} origin
 */
export function appendOriginToDescription(resultData, origin) {
  const block = buildOriginDescriptionHtml(origin);
  if (!block) return;

  resultData.system ??= {};
  resultData.system.description ??= {};
  const existing = stripOriginFromDescription(resultData.system.description.value ?? "");
  const separator = existing ? "\n" : "";
  resultData.system.description.value = `${existing}${separator}${block}`;
}

/**
 * Read-only HTML for the item sheet (description tab); legacy panel markup.
 * @param {Item} item
 * @returns {string}
 */
export function buildOriginSheetPanelHtml(item) {
  const origin = getCraftOrigin(item);
  if (!origin) return "";

  const crafter = escapeHtml(origin.crafterName ?? "—");
  const recipe = escapeHtml(origin.recipeName ?? item.name ?? "—");
  const date = escapeHtml(formatOriginDate(origin.craftedAt));
  const check = escapeHtml(buildOriginCheckLine(origin.check) || "—");

  let stationRow = "";
  if (origin.station?.name) {
    stationRow = game.i18n.format("ADVENTURECRAFT.Origin.SheetStationRow", {
      label: escapeHtml(game.i18n.localize("ADVENTURECRAFT.Origin.SheetStation")),
      name: escapeHtml(origin.station.name),
    });
  }

  return game.i18n.format("ADVENTURECRAFT.Origin.SheetPanel", {
    title: escapeHtml(game.i18n.localize("ADVENTURECRAFT.Origin.SheetTitle")),
    crafterLabel: escapeHtml(game.i18n.localize("ADVENTURECRAFT.Origin.SheetCrafter")),
    crafter,
    recipeLabel: escapeHtml(game.i18n.localize("ADVENTURECRAFT.Origin.SheetRecipe")),
    recipe,
    dateLabel: escapeHtml(game.i18n.localize("ADVENTURECRAFT.Origin.SheetDate")),
    date,
    checkLabel: escapeHtml(game.i18n.localize("ADVENTURECRAFT.Origin.SheetCheck")),
    check,
    stationRow,
  });
}

/**
 * @param {Item} item
 * @returns {string}
 */
export function buildOriginChatContent(item) {
  const origin = getCraftOrigin(item);
  if (!origin) {
    return `<p>${escapeHtml(game.i18n.localize("ADVENTURECRAFT.Origin.NoOrigin"))}</p>`;
  }

  const crafter = escapeHtml(origin.crafterName ?? "—");
  const recipe = escapeHtml(origin.recipeName ?? item.name ?? "—");
  const date = escapeHtml(formatOriginDate(origin.craftedAt));
  const checkText = buildOriginCheckLine(origin.check);
  const checkBlock = checkText ? `<p>${escapeHtml(checkText)}</p>` : "";
  const stationBlock = _buildStationBlock(origin.station);

  return game.i18n.format("ADVENTURECRAFT.Origin.ChatTemplate", {
    item: escapeHtml(item.name ?? ""),
    crafter,
    recipe,
    date,
    checkBlock,
    stationBlock,
  });
}

/**
 * @param {Item} item
 * @param {{ speakerActor?: Actor }} [options]
 */
export async function postOriginToChat(item, { speakerActor } = {}) {
  if (!hasCraftOrigin(item)) {
    ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Origin.NoOrigin"));
    return;
  }

  const content = buildOriginChatContent(item);
  const actor = speakerActor
    ?? item.parent
    ?? item.actor
    ?? null;

  await ChatMessage.create({
    user: game.user.id,
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
    content,
    flags: { [CORE_ID]: { craftOrigin: true, itemId: item.id } },
  });
}

/**
 * @param {Item} item
 * @param {object} origin
 */
export async function applyOriginToCraftedItem(item, origin) {
  if (!item?.id || !origin) return;
  if (hasCraftOrigin(item)) return;
  try {
    await item.setFlag(CORE_ID, "origin", origin);
  } catch (err) {
    console.warn("AdventureCraft | applyOriginToCraftedItem failed:", err);
    ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Origin.PersistFailed"));
  }
}
