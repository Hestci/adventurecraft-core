import { CORE_ID, LEGACY_MODULE_ID } from "./constants.js";
import { userCanForUser } from "./permissions.js";
import { isRecipeBookItem, isRecipeItem } from "./flag-utils.js";

const BRIDGE_ID = "adventurecraft-dnd5e";

/**
 * Document hooks enforce AdventureCraft role settings on the initiating client.
 * They do not replace Foundry's native Item Directory permissions for GMs.
 */

function _user(userId) {
  return game.users.get(userId);
}

function _isGm(userId) {
  return _user(userId)?.isGM === true;
}

function _deny(userId, operation) {
  if (game.user?.id === userId) {
    ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.NoPermission"));
  }
  return false;
}

function _flag(data, moduleId, key) {
  return foundry.utils.getProperty(data, `flags.${moduleId}.${key}`);
}

function _isWorldItemData(_data, options) {
  return !_actorParent(options);
}

function _actorParent(options) {
  const p = options?.parent;
  return p?.documentName === "Actor" ? p : null;
}

function _userOwnsActor(userId, actor) {
  const user = _user(userId);
  return Boolean(user && actor?.testUserPermission(user, "OWNER"));
}

function _guardPreCreateItem(_doc, data, options, userId) {
  if (_isGm(userId)) return true;

  const isRecipe = _flag(data, CORE_ID, "isRecipe") === true
    || _flag(data, LEGACY_MODULE_ID, "isRecipe") === true;
  const isBook = _flag(data, CORE_ID, "isRecipeBook") === true
    || _flag(data, LEGACY_MODULE_ID, "isRecipeBook") === true;
  const isCrafted = _flag(data, BRIDGE_ID, "crafted") === true
    || _flag(data, LEGACY_MODULE_ID, "crafted") === true;

  if (isRecipe && _isWorldItemData(data, options)) {
    return userCanForUser(userId, "createRecipe") || _deny(userId, "createRecipe");
  }
  if (isBook && _isWorldItemData(data, options)) {
    return userCanForUser(userId, "createBook") || _deny(userId, "createBook");
  }
  if (isCrafted) {
    const actor = _actorParent(options);
    if (!actor) return true;
    if (!userCanForUser(userId, "combineItems")) return _deny(userId, "combineItems");
    if (!_userOwnsActor(userId, actor)) {
      if (game.user?.id === userId) denyCraftActorForUser();
      return false;
    }
  }
  return true;
}

function denyCraftActorForUser() {
  ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.NotActorOwner"));
}

function _guardPreUpdateItem(item, _changes, _options, userId) {
  if (_isGm(userId)) return true;
  if (item.parent) return true;

  if (isRecipeItem(item)) {
    return userCanForUser(userId, "editAnyRecipe") || _deny(userId, "editAnyRecipe");
  }
  if (isRecipeBookItem(item)) {
    return userCanForUser(userId, "createBook") || _deny(userId, "createBook");
  }
  return true;
}

function _guardPreDeleteItem(item, _options, userId) {
  if (_isGm(userId)) return true;
  if (item.parent) return true;

  if (isRecipeItem(item)) {
    return userCanForUser(userId, "deleteAnyRecipe") || _deny(userId, "deleteAnyRecipe");
  }
  if (isRecipeBookItem(item)) {
    return userCanForUser(userId, "createBook") || _deny(userId, "createBook");
  }
  return true;
}

export function registerDocumentGuards() {
  Hooks.on("preCreateItem", _guardPreCreateItem);
  Hooks.on("preUpdateItem", _guardPreUpdateItem);
  Hooks.on("preDeleteItem", _guardPreDeleteItem);
}
