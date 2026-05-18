import { getModuleFlag } from "./flag-utils.js";

const MIN_TIER = 1;
const MAX_TIER = 5;

/**
 * @param {object} raw
 * @returns {{ required: boolean, minTier: number }}
 */
export function normalizeRecipeStations(raw) {
  if (!raw || typeof raw !== "object") {
    return { required: false, minTier: 0 };
  }
  const required = raw.required === true;
  const minTier = required
    ? Math.min(MAX_TIER, Math.max(MIN_TIER, Math.floor(Number(raw.minTier) || MIN_TIER)))
    : 0;
  return { required, minTier };
}

/**
 * @param {object} recipe
 * @returns {{ required: boolean, minTier: number }}
 */
export function getRecipeStations(recipe) {
  return normalizeRecipeStations(recipe?.stations);
}

/**
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isStationActor(actor) {
  return getModuleFlag(actor, "isStation") === true;
}

/**
 * @param {Actor} actor
 * @returns {object|null}
 */
export function getStationData(actor) {
  if (!actor || !isStationActor(actor)) return null;
  const raw = getModuleFlag(actor, "station");
  if (!raw || typeof raw !== "object") return { tier: MIN_TIER };
  const tier = Math.min(MAX_TIER, Math.max(MIN_TIER, Math.floor(Number(raw.tier) || MIN_TIER)));
  return { tier };
}

/**
 * @param {Actor} actor
 * @returns {number}
 */
export function getStationTier(actor) {
  return getStationData(actor)?.tier ?? 0;
}

/**
 * @param {object} recipe
 * @param {{ stationMode?: boolean }} options
 * @returns {boolean}
 */
export function isRecipeVisibleInHub(recipe, { stationMode = false } = {}) {
  const { required } = getRecipeStations(recipe);
  if (stationMode) return required;
  return !required;
}

/**
 * @param {object} recipe
 * @param {Actor|null} stationActor
 * @returns {{ ok: boolean, minTier: number, stationTier: number }}
 */
export function getRecipeStationCraftState(recipe, stationActor) {
  const { required, minTier } = getRecipeStations(recipe);
  if (!required) return { ok: true, minTier: 0, stationTier: 0, locked: false };
  const stationTier = stationActor ? getStationTier(stationActor) : 0;
  const locked = stationTier < minTier;
  return { ok: !locked, minTier, stationTier, locked };
}

/**
 * @param {object} recipe
 * @param {Actor|null} stationActor
 * @returns {boolean}
 */
export function canCraftRecipeAtStation(recipe, stationActor) {
  const { required } = getRecipeStations(recipe);
  if (!required) return true;
  if (!stationActor || !isStationActor(stationActor)) return false;
  return getRecipeStationCraftState(recipe, stationActor).ok;
}

/**
 * @param {Actor} stationActor
 * @returns {{ actorId: string, name: string, tier: number }}
 */
export function buildStationOriginContext(stationActor) {
  return {
    station: {
      actorId: stationActor.id,
      name: stationActor.name,
    },
    stationEquipment: [],
  };
}

/**
 * Resolve the player character used for crafting at a station.
 * @returns {Promise<Actor|null>}
 */
export async function resolveCraftingActor() {
  const assigned = game.user?.character;
  if (assigned?.isOwner) return assigned;

  const owned = game.actors.filter(a => a.type === "character" && a.isOwner);
  if (owned.length === 1) return owned[0];
  if (!owned.length) {
    ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Message.NoActiveCharacter"));
    return null;
  }

  const options = owned.map(a => `<option value="${a.id}">${foundry.utils.escapeHTML(a.name)}</option>`).join("");
  const content = `<form><div class="form-group">
    <label>${game.i18n.localize("ADVENTURECRAFT.Station.SelectCharacter")}</label>
    <select name="actorId" style="width:100%">${options}</select>
  </div></form>`;

  const actorId = await Dialog.prompt({
    title: game.i18n.localize("ADVENTURECRAFT.Station.SelectCharacterTitle"),
    content,
    label: game.i18n.localize("ADVENTURECRAFT.Button.Confirm"),
    callback: html => html.find('[name="actorId"]').val(),
    rejectClose: false,
  });
  if (!actorId) return null;
  return game.actors.get(actorId) ?? null;
}

/**
 * @param {Actor} stationActor
 * @returns {Promise<void>}
 */
export async function openStationHub(stationActor) {
  if (!stationActor || !isStationActor(stationActor)) return;
  const { AdventureCraftHub } = await import("./apps/AdventureCraftHub.js");
  const crafter = await resolveCraftingActor();
  if (!crafter) return;
  new AdventureCraftHub(crafter, { stationActor }).render(true);
}
