import { CORE_ID, LEGACY_MODULE_ID } from "./constants.js";
import { RecipeStore } from "./data/RecipeStore.js";
import { isRecipeItem } from "./flag-utils.js";
import { findIngredientItem } from "./crafting-utils.js";
import { getAdapter } from "./api/system-adapter.js";
import { escapeHtml } from "./html-utils.js";
import { userCan } from "./permissions.js";

const MAX_LIST_ENTRIES = 200;
const MAX_RECIPE_ID_LEN = 64;

function _getShoppingListRaw(actor) {
  const core = actor.getFlag(CORE_ID, "shoppingList");
  if (Array.isArray(core)) return core;
  const legacy = actor.getFlag(LEGACY_MODULE_ID, "shoppingList");
  return Array.isArray(legacy) ? legacy : [];
}

function _sanitizeEntry(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const recipeId = typeof raw.recipeId === "string" ? raw.recipeId.trim() : "";
  if (!recipeId || recipeId.length > MAX_RECIPE_ID_LEN) return null;
  const addedAt = Math.floor(Number(raw.addedAt) || 0);
  return { recipeId, addedAt: addedAt > 0 ? addedAt : Date.now() };
}

export function getShoppingList(actor) {
  if (!actor) return [];
  const seen = new Set();
  const out = [];
  for (const raw of _getShoppingListRaw(actor)) {
    const entry = _sanitizeEntry(raw);
    if (!entry || seen.has(entry.recipeId)) continue;
    seen.add(entry.recipeId);
    out.push(entry);
    if (out.length >= MAX_LIST_ENTRIES) break;
  }
  return out;
}

export function isRecipeWishlisted(actor, recipeId) {
  if (!actor || typeof recipeId !== "string" || !recipeId) return false;
  return getShoppingList(actor).some(e => e.recipeId === recipeId);
}

export async function setShoppingList(actor, list) {
  if (!actor) return;
  const sanitized = [];
  const seen = new Set();
  for (const raw of list) {
    const entry = _sanitizeEntry(raw);
    if (!entry || seen.has(entry.recipeId)) continue;
    seen.add(entry.recipeId);
    sanitized.push(entry);
    if (sanitized.length >= MAX_LIST_ENTRIES) break;
  }
  await actor.setFlag(CORE_ID, "shoppingList", sanitized);
}

export async function toggleRecipeWishlist(actor, recipeId) {
  if (!actor || typeof recipeId !== "string" || !recipeId) return false;
  const list = getShoppingList(actor);
  const idx = list.findIndex(e => e.recipeId === recipeId);
  if (idx >= 0) {
    list.splice(idx, 1);
    await setShoppingList(actor, list);
    return false;
  }
  list.push({ recipeId, addedAt: Date.now() });
  await setShoppingList(actor, list);
  return true;
}

export async function removeRecipeFromShoppingList(actor, recipeId) {
  if (!actor || typeof recipeId !== "string" || !recipeId) return;
  const list = getShoppingList(actor).filter(e => e.recipeId !== recipeId);
  await setShoppingList(actor, list);
}

export function isShoppingListGmEnabled() {
  try {
    return game.settings.get(CORE_ID, "shoppingListGmEnabled") === true;
  } catch {
    return false;
  }
}

/** @param {Actor} actor */
export function canUserEditActorWishlist(actor) {
  return Boolean(actor?.isOwner);
}

/** @param {Actor} actor */
export function canUserViewActorWishlist(actor) {
  if (!actor) return false;
  if (actor.isOwner) return true;
  if (!isShoppingListGmEnabled()) return false;
  return userCan("viewShoppingList");
}

/** @param {Actor} actor */
export function canUserPostShoppingList(actor) {
  return canUserViewActorWishlist(actor);
}

export function resolveWishlistRecipes(actor) {
  if (!actor) return [];
  const out = [];
  for (const { recipeId } of getShoppingList(actor)) {
    const actorItem = actor.items.get(recipeId);
    if (!actorItem || !isRecipeItem(actorItem)) continue;
    out.push({ id: recipeId, recipe: RecipeStore._itemToRecipe(actorItem) });
  }
  return out;
}

function _ingredientAggregateKey(ing) {
  if (ing.uuid && typeof ing.uuid === "string") return `uuid:${ing.uuid}`;
  const tags = (ing.tags ?? []).slice().sort().join(",");
  const name = String(ing.name ?? "").trim();
  return `name:${name}|tags:${tags}`;
}

function _resolveItemLink(ing) {
  const name = String(ing.name ?? "").trim();
  if (!name) return { label: "", html: "" };

  if (ing.uuid && typeof ing.uuid === "string") {
    const doc = foundry.utils.fromUuidSync?.(ing.uuid) ?? null;
    if (doc) {
      const label = escapeHtml(doc.name ?? name);
      return { label, html: `@UUID[${ing.uuid}]{${label}}` };
    }
  }

  const world = game.items.find(i => i.name === name);
  if (world?.uuid) {
    const label = escapeHtml(world.name);
    return { label, html: `@UUID[${world.uuid}]{${label}}` };
  }

  const img = ing.img ? `<img src="${escapeHtml(ing.img)}" width="16" height="16" style="vertical-align:middle;border:0"/>` : "";
  return { label: escapeHtml(name), html: `${img}<strong>${escapeHtml(name)}</strong>` };
}

/**
 * @param {Actor} actor
 * @returns {Array<{ key: string, name: string, img: string|null, shortage: number, linkHtml: string, tags?: string[] }>}
 */
export function aggregateShoppingShortages(actor) {
  if (!actor) return [];
  const adapter = getAdapter();
  const totals = new Map();

  for (const { recipe } of resolveWishlistRecipes(actor)) {
    const ingredients = recipe.ingredients ?? [];
    for (const ing of ingredients) {
      const key = _ingredientAggregateKey(ing);
      const needed = Math.max(1, Math.floor(Number(ing.quantity) || 1));
      const prev = totals.get(key);
      if (prev) {
        prev.needed += needed;
      } else {
        totals.set(key, {
          needed,
          ing: {
            name: ing.name,
            img: ing.img ?? null,
            uuid: ing.uuid ?? null,
            tags: ing.tags ?? [],
            quantity: ing.quantity,
          },
        });
      }
    }
  }

  const shortages = [];
  for (const [key, { needed, ing }] of totals) {
    const item = findIngredientItem(actor, ing);
    const have = item ? adapter.getItemQuantity(item) : 0;
    const shortage = Math.max(0, needed - have);
    if (shortage <= 0) continue;
    const link = _resolveItemLink(ing);
    shortages.push({
      key,
      name: ing.name,
      img: ing.img,
      shortage,
      linkHtml: link.html,
      tags: ing.tags,
    });
  }

  shortages.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  return shortages;
}

export function buildShoppingListChatContent(actor, shortages) {
  const list = getShoppingList(actor);
  const actorName = escapeHtml(actor?.name ?? "");

  if (!list.length) {
    return `<div class="adventurecraft ac-shopping-chat">
      <h3>${game.i18n.localize("ADVENTURECRAFT.ShoppingList.ChatTitle")}</h3>
      <p><em>${game.i18n.format("ADVENTURECRAFT.ShoppingList.ChatEmpty", { actor: actorName })}</em></p>
    </div>`;
  }

  if (!shortages.length) {
    return `<div class="adventurecraft ac-shopping-chat">
      <h3>${game.i18n.localize("ADVENTURECRAFT.ShoppingList.ChatTitle")}</h3>
      <p><em>${game.i18n.format("ADVENTURECRAFT.ShoppingList.ChatAllInStock", { actor: actorName })}</em></p>
    </div>`;
  }

  const rows = shortages.map(s => {
    const need = game.i18n.format("ADVENTURECRAFT.ShoppingList.ChatNeedMore", { shortage: s.shortage });
    return `<li>${s.linkHtml} — ${need}</li>`;
  }).join("");

  return `<div class="adventurecraft ac-shopping-chat">
    <h3>${game.i18n.format("ADVENTURECRAFT.ShoppingList.ChatTitleFor", { actor: actorName })}</h3>
    <ul class="ac-shopping-chat-list">${rows}</ul>
  </div>`;
}

export async function postShoppingListToChat(actor) {
  if (!actor) {
    ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Message.NoActiveCharacter"));
    return null;
  }
  if (!canUserPostShoppingList(actor)) {
    ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.NoPermission"));
    return null;
  }

  const shortages = aggregateShoppingShortages(actor);
  const content = buildShoppingListChatContent(actor, shortages);

  const message = await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { [CORE_ID]: { shoppingList: true } },
  });

  return message;
}
