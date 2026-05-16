import { getAdapter } from "./api/system-adapter.js";
import { CORE_ID } from "./constants.js";
import { getModuleFlag } from "./flag-utils.js";
import {
  pickCritPoolOption,
  validateCritPoolConfig,
  normalizePoolEntry,
  formatPoolOptionLabel,
} from "./crit-pool.js";
import { _log } from "./ac-debug-log.js";
import {
  incrementMasteryCount,
  isMasteryGuaranteed,
  masteryAllowsCritRoll,
} from "./mastery-utils.js";
import { escapeHtml } from "./html-utils.js";

export { pickCritPoolOption, validateCritPoolConfig, normalizePoolEntry, formatPoolOptionLabel };

export function pickCritQualityWord() {
  const raw = game.i18n.localize("ADVENTURECRAFT.Quality.WordPool");
  const parts = String(raw)
    .split("|")
    .map(s => s.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  return parts[Math.floor(Math.random() * parts.length)] ?? "";
}

export function findIngredientItem(actor, ing) {
  const byName = actor.items.find(i => i.name === ing.name);
  if (byName) return byName;
  if (!ing.tags?.length) return null;
  return actor.items.find(i => {
    const itemTags = getModuleFlag(i, "tags") ?? [];
    return ing.tags.some(t => itemTags.includes(t));
  });
}

export function checkIngredients(actor, ingredients) {
  const adapter = getAdapter();
  const missing = [];
  for (const ing of ingredients) {
    const needed = ing.quantity ?? 1;
    const found = findIngredientItem(actor, ing);
    const have = found ? adapter.getItemQuantity(found) : 0;
    if (!found || have < needed) {
      const label = ing.tags?.length
        ? game.i18n.format("ADVENTURECRAFT.Message.IngredientWithTags", { name: ing.name, tags: ing.tags.join(", ") })
        : ing.name;
      missing.push({ name: label, needed, have });
    }
  }
  return missing;
}

export function enrichIngredients(actor, ingredients) {
  const adapter = getAdapter();
  return ingredients.map(ing => {
    const item = findIngredientItem(actor, ing);
    const needed = ing.quantity ?? 1;
    const have = item ? adapter.getItemQuantity(item) : 0;
    const status = have >= needed ? "ok" : have > 0 ? "partial" : "missing";
    return { ...ing, have, status };
  });
}

export async function consumeIngredients(actor, ingredients) {
  const adapter = getAdapter();
  for (const ing of ingredients) {
    const needed = ing.quantity ?? 1;
    const item = findIngredientItem(actor, ing);
    if (!item) continue;
    await adapter.consumeItemQuantity(item, needed);
  }
}

export async function performCheck(actor, recipe) {
  if (!recipe.check?.type) {
    return { success: true, consume: true, critSuccess: false, critFail: false };
  }

  const masteryGuaranteed = isMasteryGuaranteed(actor, recipe);
  const rollForCritOnly = masteryGuaranteed && masteryAllowsCritRoll(recipe);

  if (masteryGuaranteed && !rollForCritOnly) {
    return { success: true, consume: true, critSuccess: false, critFail: false, masteryGuaranteed: true };
  }

  const { consumeOnFail } = recipe.check;
  try {
    const rolled = await getAdapter().rollCraftCheck(actor, recipe);
    if (rolled.fail) return rolled.fail;

    const { roll, dc, threshold } = rolled;
    const critSuccess = roll.total >= dc + threshold;
    const success = rollForCritOnly ? true : roll.total >= dc;
    const critFail = rollForCritOnly ? false : (!success && roll.total <= dc - threshold);

    _log.log(
      `AdventureCraft | performCheck: rolled=${roll.total} vs DC=${dc} → success=${success} crit=${critSuccess}`,
    );

    return {
      success,
      consume: success || consumeOnFail,
      critSuccess,
      critFail,
      ...(rollForCritOnly ? { masteryGuaranteed: true } : {}),
    };
  } catch (err) {
    console.warn("AdventureCraft | performCheck failed:", err);
    return { success: false, consume: false, critSuccess: false, critFail: false };
  }
}

export function getRawCritSuccess(recipe) {
  return recipe.check?.critSuccess ?? { type: "qty", qty: recipe.check?.critSuccessQty ?? 1 };
}

export function resolveAtomicCritSuccess(recipe) {
  const cs = getRawCritSuccess(recipe);
  const t = cs.type ?? "qty";
  if (t === "auto") return getAdapter().inferAutoCritSuccess(recipe.result);
  if (t === "pool") return { type: "qty", qty: 1 };
  return cs;
}

export function applyCritEffect(resultData, recipe, cs) {
  return getAdapter().applyCritToResultData(resultData, recipe, cs);
}

export function applyCritSuccess(resultData, recipe) {
  const head = getRawCritSuccess(recipe);
  const t = head.type ?? "qty";
  if (t === "pool") {
    console.warn("AdventureCraft | applyCritSuccess: pool type must use applyCritEffect after pickCritPoolOption");
    return { label: "" };
  }
  const cs = t === "auto" ? getAdapter().inferAutoCritSuccess(recipe.result) : head;
  return applyCritEffect(resultData, recipe, cs);
}

export function critSuccessChangesProperties(recipe, poolPick) {
  const head = getRawCritSuccess(recipe);
  const t = head.type ?? "qty";
  if (t === "pool") {
    if (!poolPick) return false;
    const pt = poolPick.type ?? "qty";
    return pt === "property" || pt === "damage" || pt === "itemProperty";
  }
  const eff = resolveAtomicCritSuccess(recipe);
  const et = eff.type ?? "qty";
  return et === "property" || et === "damage" || et === "itemProperty";
}

export async function runCraftExecution(actor, recipe) {
  const adapter = getAdapter();
  const { success, consume, critSuccess, critFail } = await performCheck(actor, recipe);

  if (consume || critFail) await consumeIngredients(actor, recipe.ingredients);

  if (!success) {
    const msg = critFail
      ? game.i18n.localize("ADVENTURECRAFT.Message.CritFailConsume")
      : (recipe.check?.consumeOnFail
          ? game.i18n.localize("ADVENTURECRAFT.Message.CraftFailedConsume")
          : game.i18n.localize("ADVENTURECRAFT.Message.CraftFailedKeep"));
    ui.notifications.warn(msg);
    return false;
  }

  const resultData = foundry.utils.deepClone(recipe.result);
  adapter.prepareResultQuantity(resultData, recipe);

  let critLabel = "";
  let poolPick = null;
  const head = getRawCritSuccess(recipe);
  const headType = head.type ?? "qty";

  if (critSuccess) {
    if (headType === "pool") {
      poolPick = await pickCritPoolOption(recipe);
      if (poolPick) {
        const info = applyCritEffect(resultData, recipe, poolPick);
        critLabel = info.label
          ? ` ${game.i18n.format("ADVENTURECRAFT.Message.CritSuccess", { label: info.label })}`
          : ` ${game.i18n.localize("ADVENTURECRAFT.Message.CritSuccessGeneric")}`;
      } else {
        ui.notifications.info(game.i18n.localize("ADVENTURECRAFT.Message.CritPoolSkipped"));
      }
    } else {
      const info = applyCritSuccess(resultData, recipe);
      critLabel = info.label
        ? ` ${game.i18n.format("ADVENTURECRAFT.Message.CritSuccess", { label: info.label })}`
        : ` ${game.i18n.localize("ADVENTURECRAFT.Message.CritSuccessGeneric")}`;
    }
  }

  const critChangesProperties = critSuccessChangesProperties(recipe, poolPick);
  const qty = foundry.utils.getProperty(resultData, "system.quantity") ?? 1;

  adapter.patchRecipeResultFlags(resultData, recipe.id);

  const stackTarget = adapter.findStackTarget(actor, resultData, critChangesProperties);

  const qualityEnabled = recipe.critQualityNames === true;
  let qualityWord = "";
  if (critSuccess && qualityEnabled) {
    qualityWord = pickCritQualityWord();
    if (qualityWord && !stackTarget) {
      const baseName = resultData.name ?? recipe.result.name ?? "";
      resultData.name = game.i18n.format("ADVENTURECRAFT.Quality.NameFormat", {
        quality: qualityWord,
        name: baseName,
      });
    }
  }

  const { item: resultItem, created } = await adapter.createOrStackCraftedItem(
    actor,
    resultData,
    qty,
    stackTarget,
  );

  const qtyLabel = qty > 1 ? ` ×${qty}` : "";
  const notifyName = created ? (resultData.name ?? recipe.result.name) : resultItem.name;
  ui.notifications.info(
    game.i18n.format("ADVENTURECRAFT.Message.CraftSuccess", { name: notifyName, qtyLabel, critLabel }),
  );

  const critDetail = (critLabel && String(critLabel).trim())
    ? `<p style="margin:0.25rem 0 0;font-size:0.9em;opacity:0.9">${escapeHtml(String(critLabel).trim())}</p>`
    : "";
  const highQuality = game.i18n.localize("ADVENTURECRAFT.Quality.HighQualityPhrase");
  let chatContent;
  if (critSuccess && qualityWord) {
    if (!created) {
      chatContent = game.i18n.format("ADVENTURECRAFT.Message.ChatCraftCritStacked", {
        actor: escapeHtml(actor.name),
        name: escapeHtml(resultItem.name),
        qty,
        quality: escapeHtml(qualityWord),
        highQuality,
        critDetail,
      });
    } else {
      chatContent = game.i18n.format("ADVENTURECRAFT.Message.ChatCraftCrit", {
        actor: escapeHtml(actor.name),
        name: escapeHtml(resultData.name ?? recipe.result.name),
        qtyLabel,
        quality: escapeHtml(qualityWord),
        highQuality,
        critDetail,
      });
    }
  } else {
    chatContent = game.i18n.format("ADVENTURECRAFT.Message.ChatCraftPlain", {
      actor: escapeHtml(actor.name),
      name: escapeHtml(resultItem.name),
      qtyLabel,
    });
  }

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content: chatContent,
    flags: { [CORE_ID]: { craftResult: true, crit: !!critSuccess } },
  });

  await incrementMasteryCount(actor, recipe);
  return true;
}

export function formatCraftConfirmCheckParagraph(actor, recipe) {
  if (!recipe.check?.type) return "";
  if (isMasteryGuaranteed(actor, recipe)) {
    const key = masteryAllowsCritRoll(recipe)
      ? "ADVENTURECRAFT.Dialog.ConfirmCraftMasteryCritRoll"
      : "ADVENTURECRAFT.Dialog.ConfirmCraftMasteryGuaranteed";
    return `<p><em>${game.i18n.localize(key)}</em></p>`;
  }
  const checkTypeLabel = game.i18n.localize(
    `ADVENTURECRAFT.Check.Type${recipe.check.type.charAt(0).toUpperCase()}${recipe.check.type.slice(1)}`,
  );
  return `<p><em>${game.i18n.format("ADVENTURECRAFT.Dialog.ConfirmCraftWithCheck", { type: checkTypeLabel, dc: recipe.check.dc })}</em></p>`;
}

export async function performCraft(actor, recipe) {
  const missing = checkIngredients(actor, recipe.ingredients);
  if (missing.length) {
    const list = missing.map(m => `${m.name} ×${m.needed} (${m.have})`).join(", ");
    ui.notifications.warn(game.i18n.format("ADVENTURECRAFT.Message.MissingIngredients", { list }));
    return false;
  }

  const checkInfo = formatCraftConfirmCheckParagraph(actor, recipe);
  const confirmed = await Dialog.confirm({
    title: game.i18n.localize("ADVENTURECRAFT.Dialog.ConfirmCraftTitle"),
    content: `<p>${game.i18n.format("ADVENTURECRAFT.Dialog.ConfirmCraftContent", { name: escapeHtml(recipe.result?.name ?? recipe.name) })}</p>${checkInfo}`,
    yes: () => true,
    no: () => false,
    defaultYes: true,
  });
  if (!confirmed) return false;

  return runCraftExecution(actor, recipe);
}
