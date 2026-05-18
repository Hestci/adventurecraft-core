import { RecipeStore } from "../data/RecipeStore.js";
import { isRecipeItem } from "../flag-utils.js";
import { performCraft, enrichIngredients } from "../crafting-utils.js";
import { getMasteryDisplay } from "../mastery-utils.js";
import { userCan, getAllPermissions, denyAndWarn } from "../permissions.js";
import { assertActorCanCraft, denyCraftActor } from "../craft-guards.js";
import { escapeHtml } from "../html-utils.js";
import { parseRecipeImportJson } from "../recipe-import-utils.js";
import {
  getShoppingList,
  isRecipeWishlisted,
  toggleRecipeWishlist,
  removeRecipeFromShoppingList,
  postShoppingListToChat,
  canUserEditActorWishlist,
  canUserPostShoppingList,
} from "../shopping-list-utils.js";
import {
  isRecipeVisibleInHub,
  getRecipeStationCraftState,
  getStationTier,
  isStationActor,
} from "../station-utils.js";

import { CORE_ID } from "../constants.js";

const MODULE_ID = CORE_ID;

function _craftingWindowClass() {
  return game.adventurecraft?.CraftingWindow ?? null;
}

export class AdventureCraftHub extends FormApplication {
  constructor(actor, options = {}) {
    super(actor, options);
    this._stationActor = options.stationActor ?? null;
    this._searchMy      = "";
    this._categoryMy    = "";
    this._bookFilterMy  = "";
    this._searchAll     = "";
    this._categoryAll   = "";
    this._bookFilterAll = "";
  }

  get stationActor() {
    return this._stationActor;
  }

  get stationMode() {
    return Boolean(this._stationActor && isStationActor(this._stationActor));
  }

  get title() {
    if (this.stationMode) {
      return game.i18n.format("ADVENTURECRAFT.Hub.StationTitle", {
        name: this._stationActor.name,
        tier: getStationTier(this._stationActor),
      });
    }
    return game.i18n.localize("ADVENTURECRAFT.Hub.Title");
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "ac-hub",
      classes: ["adventurecraft", "ac-hub"],
      template: `modules/${MODULE_ID}/templates/hub.hbs`,
      title: game.i18n.localize("ADVENTURECRAFT.Hub.Title"),
      width: 760,
      height: 680,
      resizable: true,
      tabs: [{ navSelector: ".ac-hub-tabs", contentSelector: ".ac-hub-content", initial: "my-recipes" }],
    });
  }

  get actor() { return this.object; }

  getData() {
    const permissions = getAllPermissions();
    const allRecipes = RecipeStore.getAll();
    const myRecipes  = this.actor ? RecipeStore.getForActor(this.actor) : (permissions.canViewAllRecipes ? allRecipes : []);

    const books   = this.actor ? RecipeStore.getBooksForActor(this.actor) : RecipeStore.getBooks();
    const bookMap = Object.fromEntries(books.map(b => [b.id, b]));

    const filteredMy  = this._filterRecipes(myRecipes,  this._searchMy,  this._categoryMy,  this._bookFilterMy);
    const filteredAll = this._filterRecipes(allRecipes, this._searchAll, this._categoryAll, this._bookFilterAll);

    // Enrich recipe ingredients with availability status when actor is present
    const canEditWishlist = this.actor ? canUserEditActorWishlist(this.actor) : false;
    const stationMode = this.stationMode;
    const stationTier = stationMode ? getStationTier(this._stationActor) : 0;

    const enrichRecipe = this.actor
      ? (r) => {
          const ingredients = enrichIngredients(this.actor, r.ingredients);
          const isWishlisted = isRecipeWishlisted(this.actor, r.id);
          const stationState = getRecipeStationCraftState(r, this._stationActor);
          const ingredientsOk = ingredients.every(i => i.status === "ok");
          let base = {
            ...r,
            ingredients,
            canCraft: ingredientsOk && !stationState.locked,
            stationLocked: stationState.locked,
            stationTierRequired: stationState.minTier,
            stationTierHint: stationState.locked
              ? game.i18n.format("ADVENTURECRAFT.Station.TierRequired", {
                tier: stationState.minTier,
                current: stationTier,
              })
              : "",
            isWishlisted,
            canEditWishlist,
            showWishlistIndicator: isWishlisted && !canEditWishlist,
          };
          const masteryOk = r.mastery?.enabled === true && r.check?.type && Number(r.mastery.masteryThreshold) > 0;
          if (masteryOk) {
            const disp = getMasteryDisplay(this.actor, r);
            const masteryDcHint = !disp.isMaster && disp.dcReduction > 0 && disp.effectiveDc != null
              ? game.i18n.format("ADVENTURECRAFT.Mastery.DcReductionHint", {
                reduction: disp.dcReduction,
                effectiveDc: disp.effectiveDc,
              })
              : "";
            base = {
              ...base,
              masteryCount: disp.count,
              masteryThreshold: disp.threshold,
              masteryIsMaster: disp.isMaster,
              masteryProgressLabel: game.i18n.format("ADVENTURECRAFT.Mastery.Progress", {
                count: disp.count,
                threshold: disp.threshold,
              }),
              masteryDcHint,
            };
          }
          return base;
        }
      : (r) => r;

    // Group "My Recipes" by book
    const myBookGroups = [];
    const myUnbooked   = [];
    for (const r of filteredMy) {
      if (r.bookId && bookMap[r.bookId]) {
        let grp = myBookGroups.find(g => g.book.id === r.bookId);
        if (!grp) { grp = { book: bookMap[r.bookId], recipes: [] }; myBookGroups.push(grp); }
        grp.recipes.push(enrichRecipe(r));
      } else {
        myUnbooked.push(enrichRecipe(r));
      }
    }

    // Enrich allRecipes with book name for display
    const allRecipesEnriched = filteredAll.map(r => ({
      ...r,
      bookName: r.bookId && bookMap[r.bookId] ? bookMap[r.bookId].name : null,
    }));

    const allCategories = [...new Set(allRecipes.map(r => r.category).filter(Boolean))].sort();
    const myCategories  = [...new Set(myRecipes.map(r => r.category).filter(Boolean))].sort();

    const wishlistCount = this.actor ? getShoppingList(this.actor).length : 0;
    const canPostShoppingList = this.actor ? canUserPostShoppingList(this.actor) : false;

    return {
      permissions,
      stationMode,
      stationName: stationMode ? this._stationActor.name : "",
      stationTier,
      canCreateRecipe: userCan("createRecipe") && !stationMode,
      actor: this.actor,
      canPostShoppingList,
      wishlistCount,
      wishlistCountLabel: wishlistCount > 0
        ? game.i18n.format("ADVENTURECRAFT.ShoppingList.WishlistCount", { count: wishlistCount })
        : "",
      myBookGroups,
      myUnbooked,
      noMyRecipes:  filteredMy.length  === 0,
      allRecipes:   allRecipesEnriched,
      noAllRecipes: filteredAll.length === 0,
      myCategories:   myCategories.map(c  => ({ value: c, label: c, selected: c === this._categoryMy })),
      allCategories:  allCategories.map(c => ({ value: c, label: c, selected: c === this._categoryAll })),
      books: books.map(b => ({
        ...b,
        selectedMy:  b.id === this._bookFilterMy,
        selectedAll: b.id === this._bookFilterAll,
      })),
      searchMy:  this._searchMy,
      searchAll: this._searchAll,
    };
  }

  _filterRecipes(recipes, query, category, bookFilter) {
    const q = query.toLowerCase();
    const stationMode = this.stationMode;
    return recipes.filter(r => {
      if (!isRecipeVisibleInHub(r, { stationMode })) return false;
      if (category   && r.category !== category)  return false;
      if (bookFilter && r.bookId   !== bookFilter) return false;
      if (q && !r.name.toLowerCase().includes(q) && !(r.result?.name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }

  activateListeners(html) {
    super.activateListeners(html);

    // My recipes tab
    html.find(".ac-search-my").on("input",      e => { this._searchMy     = e.currentTarget.value; this.render(); });
    html.find(".ac-category-my").on("change",   e => { this._categoryMy   = e.currentTarget.value; this.render(); });
    html.find(".ac-book-filter-my").on("change",e => { this._bookFilterMy = e.currentTarget.value; this.render(); });
    html.find(".ac-btn-craft").on("click",  this._onCraft.bind(this));
    html.find(".ac-btn-forget").on("click", this._onForget.bind(this));
    html.find(".ac-btn-wishlist").on("click", this._onToggleWishlist.bind(this));
    html.find(".ac-btn-shopping-post").on("click", this._onPostShoppingList.bind(this));
    if (userCan("createRecipe")) {
      html.find(".ac-btn-create-recipe").on("click", this._onCreateRecipe.bind(this));
      html.find(".ac-btn-create-station").on("click", this._onCreateStation.bind(this));
    }

    // All recipes tab (permission-gated)
    html.find(".ac-search-all").on("input",       e => { this._searchAll     = e.currentTarget.value; this.render(); });
    html.find(".ac-category-all").on("change",    e => { this._categoryAll   = e.currentTarget.value; this.render(); });
    html.find(".ac-book-filter-all").on("change", e => { this._bookFilterAll = e.currentTarget.value; this.render(); });
    html.find(".ac-btn-edit").on("click",         this._onEdit.bind(this));
    html.find(".ac-btn-delete").on("click",       this._onDelete.bind(this));
    html.find(".ac-btn-manage-books").on("click", this._onManageBooks.bind(this));
    html.find(".ac-btn-export").on("click",       this._onExport.bind(this));
    html.find(".ac-import-file").on("change",     this._onImport.bind(this));
  }

  async _onCraft(event) {
    const recipeId = event.currentTarget.dataset.recipeId;
    const actor = this.actor;
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Message.NoActiveCharacter"));
      return;
    }
    if (!assertActorCanCraft(actor)) return denyCraftActor();
    // Hub recipes come from actor.items, not game.items
    const actorItem = actor.items.get(recipeId);
    const recipe = actorItem && isRecipeItem(actorItem)
      ? RecipeStore._itemToRecipe(actorItem)
      : RecipeStore.get(recipeId);
    if (!recipe) return;
    await performCraft(actor, recipe, { stationActor: this._stationActor ?? null });
    this.render();
  }

  _onManageBooks() {
    if (!userCan("createBook")) return denyAndWarn();
    const buildRows = () => {
      const books = RecipeStore.getBooks();
      return books.length
        ? books.map(b => `
            <div class="ac-book-manage-row" data-book-id="${escapeHtml(b.id)}">
              <img src="${escapeHtml(b.img)}" width="22" height="22" class="ac-book-manage-img"/>
              <input type="text" class="ac-book-name-input" value="${escapeHtml(b.name)}" style="color:#e2e0d8;background:rgba(0,0,0,0.42);border:1px solid rgba(255,255,255,0.32);"/>
              <button type="button" class="ac-book-save-btn ac-btn-secondary" data-book-id="${escapeHtml(b.id)}" title="${escapeHtml(game.i18n.localize("ADVENTURECRAFT.Button.Save"))}" style="color:#6aaa6a;background:transparent;border:1px solid rgba(255,255,255,0.18);">
                <i class="fas fa-check"></i>
              </button>
              <button type="button" class="ac-book-del-btn" data-book-id="${escapeHtml(b.id)}" title="${escapeHtml(game.i18n.localize("ADVENTURECRAFT.Button.Delete"))}" style="color:#d07070;background:transparent;border:1px solid transparent;opacity:0.65;">
                <i class="fas fa-trash"></i>
              </button>
            </div>`).join("")
        : `<p class="ac-book-empty">${game.i18n.localize("ADVENTURECRAFT.Dialog.NoBooksYet")}</p>`;
    };

    // Bind per-row listeners (called after any list update)
    const bindRowListeners = (html) => {
      html.find(".ac-book-save-btn").off("click").on("click", async e => {
        const bookId = e.currentTarget.dataset.bookId;
        const row  = html.find(`.ac-book-manage-row[data-book-id="${bookId}"]`);
        const name = row.find(".ac-book-name-input").val()?.trim();
        if (!name) return;
        const book = RecipeStore.getBook(bookId);
        await RecipeStore.saveBook({ ...book, name });
        ui.notifications.info(game.i18n.format("ADVENTURECRAFT.Message.BookRenamed", { name: escapeHtml(name) }));
        this.render();
      });

      html.find(".ac-book-del-btn").off("click").on("click", async e => {
        const bookId = e.currentTarget.dataset.bookId;
        const book = RecipeStore.getBook(bookId);
        const ok = await Dialog.confirm({
          title: game.i18n.localize("ADVENTURECRAFT.Dialog.DeleteBookTitle"),
          content: game.i18n.format("ADVENTURECRAFT.Dialog.DeleteBookContent", { name: escapeHtml(book?.name ?? "") }),
          yes: () => true, no: () => false, defaultYes: false,
        });
        if (!ok) return;
        await RecipeStore.deleteBook(bookId);
        ui.notifications.info(game.i18n.format("ADVENTURECRAFT.Message.BookDeleted", { name: escapeHtml(book?.name ?? "") }));
        // Update list in-place — no new dialog
        html.find("#ac-book-list").html(buildRows());
        bindRowListeners(html);
        this.render();
      });
    };

    // Single dialog — never re-created, only its content updates
    new Dialog({
      title: game.i18n.localize("ADVENTURECRAFT.Dialog.ManageBooksTitle"),
      content: `
        <style>
          /* Unlayered CSS - beats @layer modules with !important */
          #ac-new-book-name,
          .ac-book-name-input {
            color: #e2e0d8 !important;
            background: rgba(0,0,0,0.42) !important;
            border: 1px solid rgba(255,255,255,0.32) !important;
            border-radius: 3px !important;
          }
          #ac-add-book-btn {
            color: #e2e0d8 !important;
            background: rgba(255,255,255,0.14) !important;
            border: 1px solid rgba(255,255,255,0.32) !important;
          }
          .ac-book-save-btn {
            color: #6aaa6a !important;
            background: transparent !important;
            border: 1px solid rgba(255,255,255,0.18) !important;
          }
          .ac-book-del-btn {
            color: #d07070 !important;
            background: transparent !important;
            opacity: 0.65 !important;
          }
          /* Scrollable book list for many books */
          .ac-book-list-inner {
            max-height: 400px !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
          }
          /* Close button styling */
          .dialog-buttons button.close,
          .dialog-buttons button[data-button="close"] {
            color: #e2e0d8 !important;
            background: rgba(255,255,255,0.14) !important;
            border: 1px solid rgba(255,255,255,0.32) !important;
          }
          .dialog-buttons button.close:hover,
          .dialog-buttons button[data-button="close"]:hover {
            background: rgba(255,255,255,0.22) !important;
            border-color: rgba(255,255,255,0.45) !important;
          }
        </style>
        <div class="ac-book-dialog-body">
          <div id="ac-book-list" class="ac-book-list-inner">
            ${buildRows()}
          </div>
          <hr class="ac-book-sep"/>
          <input type="text" id="ac-new-book-name" class="ac-book-add-input" placeholder="${game.i18n.localize("ADVENTURECRAFT.Dialog.NewBookPlaceholder")}"
                 style="width:100%;height:28px;padding:3px 8px;box-sizing:border-box;font-size:0.85rem;color:#e2e0d8;background:rgba(0,0,0,0.42);border:1px solid rgba(255,255,255,0.32);border-radius:3px;margin:8px 0;"/>
          <div class="ac-book-add-row" style="display:flex;gap:8px;align-items:center;justify-content:flex-end;">
            <button type="button" id="ac-add-book-btn" class="ac-btn-primary"
                    style="flex-shrink:0;height:28px;padding:0 12px;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;color:#e2e0d8;background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.32);">
              <i class="fas fa-plus"></i> ${game.i18n.localize("ADVENTURECRAFT.Button.Create")}
            </button>
          </div>
        </div>`,
      buttons: { close: { label: game.i18n.localize("ADVENTURECRAFT.Button.Close") } },
      render: html => {
        bindRowListeners(html);

        html.find("#ac-add-book-btn").on("click", async () => {
          const input = html.find("#ac-new-book-name");
          const name = input.val()?.trim();
          if (!name) return;
          await RecipeStore.saveBook({ name });
          input.val("");
          // Update list in-place — no new dialog
          html.find("#ac-book-list").html(buildRows());
          bindRowListeners(html);
          this.render();
        });
      },
    }, { classes: ["dialog", "adventurecraft", "ac-book-dialog"], width: 480, height: "auto", resizable: true }).render(true);
  }

  async _onEdit(event) {
    if (!userCan("editAnyRecipe")) return denyAndWarn();
    const recipeId = event.currentTarget.dataset.recipeId;
    const recipe = RecipeStore.get(recipeId);
    if (!recipe) return;
    const CraftingWindow = _craftingWindowClass();
    if (!CraftingWindow) {
      ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.BridgeRequired"));
      return;
    }
    CraftingWindow.openForEdit(this.actor, recipe);
  }

  async _onDelete(event) {
    if (!userCan("deleteAnyRecipe")) return denyAndWarn();
    const recipeId = event.currentTarget.dataset.recipeId;
    const recipe = RecipeStore.get(recipeId);
    if (!recipe) return;
    const confirmed = await Dialog.confirm({
      title: game.i18n.localize("ADVENTURECRAFT.Dialog.DeleteRecipeTitle"),
      content: `<p>${game.i18n.format("ADVENTURECRAFT.Dialog.DeleteRecipeContent", { name: escapeHtml(recipe.name) })}</p>`,
      yes: () => true, no: () => false, defaultYes: false,
    });
    if (!confirmed) return;
    await RecipeStore.delete(recipeId);
    ui.notifications.info(game.i18n.format("ADVENTURECRAFT.Message.RecipeDeleted", { name: escapeHtml(recipe.name) }));
    this.render();
  }

  async _onForget(event) {
    const recipeId = event.currentTarget.dataset.recipeId;
    const actor = this.actor;
    if (!actor) return;
    const actorItem = actor.items.get(recipeId);
    if (!actorItem) return;
    const confirmed = await Dialog.confirm({
      title: game.i18n.localize("ADVENTURECRAFT.Dialog.ForgetRecipeTitle"),
      content: game.i18n.format("ADVENTURECRAFT.Dialog.ForgetRecipeContent", {
        name: escapeHtml(actorItem.name),
        actor: escapeHtml(actor.name),
      }),
      yes: () => true, no: () => false, defaultYes: false,
    });
    if (!confirmed) return;
    await removeRecipeFromShoppingList(actor, recipeId);
    await actorItem.delete();
    ui.notifications.info(game.i18n.format("ADVENTURECRAFT.Message.RecipeForgotten", { name: escapeHtml(actorItem.name) }));
    this.render();
  }

  async _onToggleWishlist(event) {
    event.preventDefault();
    event.stopPropagation();
    const actor = this.actor;
    if (!actor || !canUserEditActorWishlist(actor)) {
      denyAndWarn();
      return;
    }
    const recipeId = event.currentTarget.dataset.recipeId;
    if (!recipeId) return;
    const added = await toggleRecipeWishlist(actor, recipeId);
    const key = added ? "ADVENTURECRAFT.Message.WishlistAdded" : "ADVENTURECRAFT.Message.WishlistRemoved";
    ui.notifications.info(game.i18n.localize(key));
    this.render();
  }

  async _onPostShoppingList(event) {
    event.preventDefault();
    const actor = this.actor;
    if (!actor) return;
    await postShoppingListToChat(actor);
  }

  _onCreateRecipe() {
    if (!userCan("createRecipe")) return denyAndWarn();
    const CraftingWindow = _craftingWindowClass();
    if (!CraftingWindow) {
      ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.BridgeRequired"));
      return;
    }
    new CraftingWindow(this.actor).render(true);
  }

  _onCreateStation() {
    if (!userCan("createRecipe")) return denyAndWarn();
    const CraftingWindow = _craftingWindowClass();
    if (!CraftingWindow?.openForStation) {
      ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.BridgeRequired"));
      return;
    }
    CraftingWindow.openForStation(this.actor);
  }

  _onExport() {
    if (!userCan("importExport")) return denyAndWarn();
    const recipes = RecipeStore.getAll();
    const json = JSON.stringify(recipes, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "adventurecraft-recipes.json"; a.click();
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
      ui.notifications.error(game.i18n.localize("ADVENTURECRAFT.Message.ImportError"));
      console.error("AdventureCraft | import error:", err);
    }
  }

  async _updateObject(_event, _formData) {}
}
