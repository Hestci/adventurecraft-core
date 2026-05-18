import { CORE_ID } from "./constants.js";
import { registerSystemAdapter, getAdapter, hasAdapter } from "./api/system-adapter.js";
import { AdventureCraftHub } from "./apps/AdventureCraftHub.js";
import { RecipeBrowser } from "./apps/RecipeBrowser.js";
import { AdventureCraftSettings } from "./apps/AdventureCraftSettings.js";
import { RecipeStore } from "./data/RecipeStore.js";
import { PERMISSION_KEYS, PERMISSION_DEFAULTS, ROLE_I18N, userCan, userCanForUser, getAllPermissions } from "./permissions.js";
import { assertActorCanCraft, denyCraftActor } from "./craft-guards.js";
import { registerDocumentGuards } from "./document-guards.js";
import {
  performCraft,
  runCraftExecution,
  enrichIngredients,
  pickCritPoolOption,
  validateCritPoolConfig,
  normalizePoolEntry,
  formatPoolOptionLabel,
} from "./crafting-utils.js";
import { escapeHtml } from "./html-utils.js";
import { parseRecipeImportJson } from "./recipe-import-utils.js";
import { normalizeMasteryTiers } from "./mastery-utils.js";

const moduleApi = {
  CORE_ID,
  registerSystemAdapter,
  getAdapter,
  hasAdapter,
  RecipeStore,
  AdventureCraftHub,
  RecipeBrowser,
  AdventureCraftSettings,
  performCraft,
  runCraftExecution,
  enrichIngredients,
  userCan,
  userCanForUser,
  assertActorCanCraft,
  denyCraftActor,
  getAllPermissions,
  pickCritPoolOption,
  validateCritPoolConfig,
  normalizePoolEntry,
  formatPoolOptionLabel,
  escapeHtml,
  parseRecipeImportJson,
  normalizeMasteryTiers,
};

Hooks.once("init", () => {
  console.log(`${CORE_ID} | init`);

  game.modules.get(CORE_ID).api = moduleApi;

  game.settings.register(CORE_ID, "recipes", {
    name: "Crafting Recipes",
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  game.settings.register(CORE_ID, "books", {
    name: "Recipe Books",
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  game.settings.register(CORE_ID, "debugLogging", {
    name: "ADVENTURECRAFT.Settings.DebugLoggingName",
    hint: "ADVENTURECRAFT.Settings.DebugLoggingHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  game.settings.register(CORE_ID, "migratedToItems", {
    name: "Migrated recipes to Items",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  for (const key of PERMISSION_KEYS) {
    game.settings.register(CORE_ID, `perm.${key}`, {
      name: `ADVENTURECRAFT.Settings.Perm.${key}Name`,
      hint: `ADVENTURECRAFT.Settings.Perm.${key}Hint`,
      scope: "world",
      config: false,
      type: Number,
      default: PERMISSION_DEFAULTS[key],
      choices: ROLE_I18N,
    });
  }

  game.settings.registerMenu(CORE_ID, "settingsMenu", {
    name: "ADVENTURECRAFT.Settings.MenuName",
    label: "ADVENTURECRAFT.Settings.MenuLabel",
    hint: "ADVENTURECRAFT.Settings.MenuHint",
    icon: "fas fa-hammer",
    type: AdventureCraftSettings,
    restricted: true,
  });

  registerDocumentGuards();
});

Hooks.once("ready", () => {
  console.log(`${CORE_ID} | ready`);
  game.adventurecraft = moduleApi;

  if (game.user.isGM && !game.settings.get(CORE_ID, "migratedToItems")) {
    const oldRecipes = game.settings.get(CORE_ID, "recipes") ?? {};
    if (Object.keys(oldRecipes).length > 0) {
      ui.notifications.warn(
        game.i18n.localize("ADVENTURECRAFT.Settings.MigrationDetected"),
        { permanent: true },
      );
    }
  }
});
