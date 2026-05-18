import { CORE_ID } from "../constants.js";
import { isStationActor, getStationTier } from "../station-utils.js";
import { userCan, denyAndWarn } from "../permissions.js";

const DEFAULT_STATION_IMG = "icons/tools/smithing/anvil.webp";

function _clampTier(tier) {
  return Math.min(5, Math.max(1, Math.floor(Number(tier) || 1)));
}

export class StationStore {
  /**
   * @returns {Array<{ id: string, name: string, img: string, tier: number }>}
   */
  static getAll() {
    return game.actors
      .filter(a => isStationActor(a))
      .map(a => ({
        id: a.id,
        name: a.name,
        img: a.img,
        tier: getStationTier(a),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  }

  /**
   * @param {string} actorId
   * @returns {object|null}
   */
  static get(actorId) {
    const actor = game.actors.get(actorId);
    if (!actor || !isStationActor(actor)) return null;
    return {
      id: actor.id,
      name: actor.name,
      img: actor.img,
      tier: getStationTier(actor),
    };
  }

  /**
   * @param {{ name: string, tier?: number, img?: string }} data
   * @returns {Promise<Actor>}
   */
  static async create(data) {
    if (!userCan("createRecipe")) {
      denyAndWarn();
      throw new Error("AdventureCraft | createStation denied");
    }
    const name = String(data?.name ?? "").trim();
    if (!name) {
      ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.StationNameRequired"));
      throw new Error("AdventureCraft | station name required");
    }
    const tier = _clampTier(data?.tier);
    const img = data?.img?.trim() || DEFAULT_STATION_IMG;
    const created = await Actor.create({
      name,
      type: "npc",
      img,
      flags: {
        [CORE_ID]: {
          isStation: true,
          station: { tier },
        },
      },
    });
    ui.notifications.info(game.i18n.format("ADVENTURECRAFT.Message.StationCreated", { name }));
    return created;
  }

  /**
   * @param {string} actorId
   * @param {{ name?: string, tier?: number, img?: string }} data
   * @returns {Promise<Actor>}
   */
  static async update(actorId, data) {
    if (!userCan("createRecipe")) {
      denyAndWarn();
      throw new Error("AdventureCraft | updateStation denied");
    }
    const actor = game.actors.get(actorId);
    if (!actor || !isStationActor(actor)) {
      throw new Error(`AdventureCraft | Station actor ${actorId} not found`);
    }
    const updates = {};
    if (data?.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) {
        ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.StationNameRequired"));
        throw new Error("AdventureCraft | station name required");
      }
      updates.name = name;
    }
    if (data?.img !== undefined) updates.img = data.img?.trim() || DEFAULT_STATION_IMG;
    const tier = data?.tier !== undefined ? _clampTier(data.tier) : undefined;
    if (tier !== undefined) {
      updates[`flags.${CORE_ID}.isStation`] = true;
      updates[`flags.${CORE_ID}.station`] = { tier };
    }
    await actor.update(updates);
    ui.notifications.info(game.i18n.format("ADVENTURECRAFT.Message.StationUpdated", { name: actor.name }));
    return actor;
  }

  /**
   * @param {string} actorId
   * @returns {Promise<void>}
   */
  static async delete(actorId) {
    if (!userCan("createRecipe")) {
      denyAndWarn();
      throw new Error("AdventureCraft | deleteStation denied");
    }
    const actor = game.actors.get(actorId);
    if (!actor || !isStationActor(actor)) {
      throw new Error(`AdventureCraft | Station actor ${actorId} not found`);
    }
    const name = actor.name;
    await actor.delete();
    ui.notifications.info(game.i18n.format("ADVENTURECRAFT.Message.StationDeleted", { name }));
  }

  /**
   * @param {string} actorId
   */
  static openSheet(actorId) {
    const actor = game.actors.get(actorId);
    if (actor?.sheet) actor.sheet.render(true);
  }
}
