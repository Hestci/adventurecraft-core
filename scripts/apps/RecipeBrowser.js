import { RecipeStore } from "../data/RecipeStore.js";
import { runCraftExecution, formatCraftConfirmCheckParagraph } from "../crafting-utils.js";
import { userCan, denyAndWarn, getAllPermissions } from "../permissions.js";
import { escapeHtml } from "../html-utils.js";
import { parseRecipeImportJson } from "../recipe-import-utils.js";

import { CORE_ID } from "../constants.js";

const MODULE_ID = CORE_ID;

export class RecipeBrowser extends FormApplication {
  constructor(actor, options = {}) {
    super(actor, options);
    this._searchQuery = "";
    this._categoryFilter = "";
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "ac-recipe-browser",
      classes: ["adventurecraft", "recipe-browser"],
      template: `modules/${MODULE_ID}/templates/recipe-browser.hbs`,
      title: "ADVENTURECRAFT.Button.OpenBrowser",
      width: 560,
      height: 600,
      resizable: true,
      scrollY: [".ac-recipe-list"],
    });
  }

  get title() {
    return game.i18n.localize("ADVENTURECRAFT.Button.OpenBrowser");
  }

  get actor() {
    return this.object;
  }

  getData() {
    const all = RecipeStore.getAll();
    const allCategories = [...new Set(all.map(r => r.category).filter(Boolean))].sort();

    const q = this._searchQuery.toLowerCase();
    const cat = this._categoryFilter;
    const recipes = all.filter(r => {
      if (cat && r.category !== cat) return false;
      if (q && !r.name.toLowerCase().includes(q) && !(r.result?.name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });

    const perms = getAllPermissions();
    return {
      recipes,
      actor: this.actor,
      searchQuery: this._searchQuery,
      categories: allCategories.map(c => ({ value: c, label: c, selected: c === cat })),
      canEditAnyRecipe: perms.canEditAnyRecipe,
      canDeleteAnyRecipe: perms.canDeleteAnyRecipe,
      canImportExport: perms.canImportExport,
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find(".ac-btn-craft").on("click", this._onCraft.bind(this));
    html.find(".ac-btn-edit").on("click", this._onEditRecipe.bind(this));
    html.find(".ac-btn-delete").on("click", this._onDeleteRecipe.bind(this));

    html.find(".ac-btn-export").on("click", this._onExport.bind(this));
    html.find(".ac-import-file").on("change", this._onImport.bind(this));

    html.find(".ac-search").on("input", event => {
      this._searchQuery = event.currentTarget.value;
      this.render();
    });
    html.find(".ac-category-filter").on("change", event => {
      this._categoryFilter = event.currentTarget.value;
      this.render();
    });
  }

  async _onCraft(event) {
    const recipeId = event.currentTarget.dataset.recipeId;
    const recipe = RecipeStore.get(recipeId);
    if (!recipe) return;

    const actor = this.actor;
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Message.NoActorSelected"));
      return;
    }

    const missing = this._checkIngredients(actor, recipe.ingredients);
    if (missing.length) {
      const list = missing.map((m) => `${m.name} ×${m.needed} (have ${m.have})`).join(", ");
      ui.notifications.warn(game.i18n.format("ADVENTURECRAFT.Message.MissingIngredients", { list }));
      return;
    }

    const checkInfo = formatCraftConfirmCheckParagraph(actor, recipe);

    const confirmed = await Dialog.confirm({
      title: game.i18n.localize("ADVENTURECRAFT.Dialog.ConfirmCraftTitle"),
      content: `<p>${game.i18n.format("ADVENTURECRAFT.Dialog.ConfirmCraftContent", { name: escapeHtml(recipe.result.name) })}</p>${checkInfo}`,
      yes: () => true,
      no: () => false,
      defaultYes: true,
    });

    if (!confirmed) return;

    await runCraftExecution(actor, recipe);
    this.render();
  }

  _findIngredientItem(actor, ing) {
    const byName = actor.items.find(i => i.name === ing.name);
    if (byName) return byName;
    if (!ing.tags?.length) return null;
    return actor.items.find(i => {
      const itemTags = i.getFlag(MODULE_ID, "tags") ?? [];
      return ing.tags.some(t => itemTags.includes(t));
    });
  }

  _checkIngredients(actor, ingredients) {
    const missing = [];
    for (const ing of ingredients) {
      const needed = ing.quantity ?? 1;
      const found = this._findIngredientItem(actor, ing);
      const have = found?.system?.quantity ?? (found ? 1 : 0);
      if (!found || have < needed) {
        const label = ing.tags?.length
          ? game.i18n.format("ADVENTURECRAFT.Message.IngredientWithTags", { name: ing.name, tags: ing.tags.join(", ") })
          : ing.name;
        missing.push({ name: label, needed, have });
      }
    }
    return missing;
  }

  _onEditRecipe(event) {
    if (!userCan("editAnyRecipe")) return denyAndWarn();
    const recipeId = event.currentTarget.dataset.recipeId;
    const recipe = RecipeStore.get(recipeId);
    if (!recipe) return;
    const CraftingWindow = game.adventurecraft?.CraftingWindow;
    if (!CraftingWindow) {
      ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.BridgeRequired"));
      return;
    }
    CraftingWindow.openForEdit(this.actor, recipe);
  }

  async _onDeleteRecipe(event) {
    if (!userCan("deleteAnyRecipe")) return denyAndWarn();
    const recipeId = event.currentTarget.dataset.recipeId;
    const recipe = RecipeStore.get(recipeId);
    if (!recipe) return;

    const confirmed = await Dialog.confirm({
      title: game.i18n.localize("ADVENTURECRAFT.Dialog.DeleteRecipeTitle"),
      content: `<p>${game.i18n.format("ADVENTURECRAFT.Dialog.DeleteRecipeContent", { name: escapeHtml(recipe.name) })}</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false,
    });

    if (!confirmed) return;

    await RecipeStore.delete(recipeId);
    ui.notifications.info(game.i18n.format("ADVENTURECRAFT.Message.RecipeDeleted", { name: escapeHtml(recipe.name) }));
    this.render();
  }

  _onExport() {
    if (!userCan("importExport")) return denyAndWarn();
    const recipes = RecipeStore.getAll();
    const json = JSON.stringify(recipes, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "adventurecraft-recipes.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async _onImport(event) {
    if (!userCan("importExport")) return denyAndWarn();
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    event.currentTarget.value = "";
    try {
      const text = await file.text();
      const recipes = parseRecipeImportJson(text);
      let count = 0;
      for (const recipe of recipes) {
        await RecipeStore.save(recipe);
        count++;
      }
      ui.notifications.info(game.i18n.format("ADVENTURECRAFT.Message.RecipesImported", { count }));
      this.render();
    } catch (err) {
      ui.notifications.error(game.i18n.localize("ADVENTURECRAFT.Message.ImportFailed"));
      console.error("AdventureCraft | import error:", err);
    }
  }

  async _updateObject(_event, _formData) {}
}
