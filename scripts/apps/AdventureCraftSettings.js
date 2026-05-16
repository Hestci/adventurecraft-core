import { RecipeStore } from "../data/RecipeStore.js";
import { PERMISSION_KEYS, ROLE_I18N, getPermissionMinimum } from "../permissions.js";

import { CORE_ID } from "../constants.js";

const MODULE_ID = CORE_ID;
const BRIDGE_ID = "adventurecraft-dnd5e";

function _bridgeSetting(key, fallback = false) {
  try {
    return game.settings.get(BRIDGE_ID, key);
  } catch {
    return fallback;
  }
}

async function _setBridgeSetting(key, value) {
  try {
    await game.settings.set(BRIDGE_ID, key, value);
  } catch (err) {
    console.warn(`AdventureCraft | cannot set ${BRIDGE_ID}.${key}:`, err);
  }
}

export class AdventureCraftSettings extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "ac-settings",
      classes: ["adventurecraft", "ac-settings-form"],
      template: `modules/${MODULE_ID}/templates/settings.hbs`,
      title: game.i18n.localize("ADVENTURECRAFT.Settings.Title"),
      width: 420,
      height: "auto",
      closeOnSubmit: true,
    });
  }

  getData() {
    const migratedToItems = game.settings.get(MODULE_ID, "migratedToItems");
    const needsMigration = !migratedToItems &&
      Object.keys(game.settings.get(MODULE_ID, "recipes") ?? {}).length > 0;

    const debugLogging = game.settings.get(MODULE_ID, "debugLogging");
    const enableCombine = _bridgeSetting("enableCombine");
    const showRecipeResultProps = _bridgeSetting("showRecipeResultProps");
    const bridgeActive = game.modules.get(BRIDGE_ID)?.active === true;

    const permissions = PERMISSION_KEYS.map(key => {
      const current = getPermissionMinimum(key);
      return {
        key,
        nameKey: `ADVENTURECRAFT.Settings.Perm.${key}Name`,
        hintKey: `ADVENTURECRAFT.Settings.Perm.${key}Hint`,
        options: Object.entries(ROLE_I18N).map(([value, labelKey]) => ({
          value: Number(value),
          labelKey,
          selected: Number(value) === current,
        })),
      };
    });

    return { debugLogging, enableCombine, showRecipeResultProps, bridgeActive, needsMigration, permissions };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='close']").on("click", () => this.close());
    html.find("[data-action='migrate']").on("click", async () => {
      await AdventureCraftSettings.migrateToItems();
      this.render();
    });
  }

  static async migrateToItems() {
    const oldBooks   = game.settings.get(MODULE_ID, "books")   ?? {};
    const oldRecipes = game.settings.get(MODULE_ID, "recipes") ?? {};
    const bookCount  = Object.keys(oldBooks).length;
    const bookIdMap  = {};

    for (const [oldId, b] of Object.entries(oldBooks)) {
      try {
        const created = await RecipeStore.saveBook({ name: b.name, img: b.img });
        bookIdMap[oldId] = created.id;
      } catch (err) {
        console.error(`AdventureCraft | Migration: failed to create book "${b.name}":`, err);
      }
    }

    let count = 0;
    for (const [, r] of Object.entries(oldRecipes)) {
      try {
        await RecipeStore.save({
          name:        r.name,
          category:    r.category,
          check:       r.check,
          ingredients: r.ingredients,
          result:      r.result,
          bookId:      r.bookId ? bookIdMap[r.bookId] : null,
        });
        count++;
      } catch (err) {
        console.error(`AdventureCraft | Migration: failed to create recipe "${r.name}":`, err);
      }
    }

    await game.settings.set(MODULE_ID, "migratedToItems", true);
    ui.notifications.info(
      game.i18n.format("ADVENTURECRAFT.Settings.MigrationComplete", {
        bookCount,
        recipeCount: count
      })
    );
  }

  async _updateObject(_event, formData) {
    await game.settings.set(MODULE_ID, "debugLogging", !!formData.debugLogging);
    if (game.modules.get(BRIDGE_ID)?.active) {
      await _setBridgeSetting("enableCombine", !!formData.enableCombine);
      await _setBridgeSetting("showRecipeResultProps", !!formData.showRecipeResultProps);
    }
    for (const key of PERMISSION_KEYS) {
      const value = Number(formData[`perm_${key}`]);
      if (Number.isFinite(value) && value >= 1 && value <= 4) {
        await game.settings.set(MODULE_ID, `perm.${key}`, value);
      }
    }
    ui.notifications.info(game.i18n.localize("ADVENTURECRAFT.Settings.SettingsSaved"));
  }
}
