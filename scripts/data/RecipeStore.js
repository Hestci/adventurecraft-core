import { CORE_ID } from "../constants.js";
import { getAdapter } from "../api/system-adapter.js";
import {
  getModuleFlag,
  getRecipeData,
  isRecipeItem,
  isRecipeBookItem,
} from "../flag-utils.js";

export class RecipeStore {

  static _getContainerId(item) {
    return getAdapter().getRecipeBookLink(item);
  }

  static _normalizeMasteryFromData(m) {
    if (!m || m.enabled !== true) return null;
    const th = Math.floor(Number(m.masteryThreshold) || 0);
    if (th < 1) return null;
    return {
      enabled: true,
      masteryThreshold: th,
      allowCritRoll: m.allowCritRoll === true,
    };
  }

  static _normalizeMasteryForSave(m) {
    if (!m || m.enabled !== true) return null;
    const th = Math.floor(Number(m.masteryThreshold) || 0);
    if (th < 1) return null;
    return {
      enabled: true,
      masteryThreshold: th,
      allowCritRoll: m.allowCritRoll === true,
    };
  }

  static _itemToRecipe(item) {
    const rd = getRecipeData(item);
    return {
      id:          item.id,
      name:        item.name,
      category:    rd.category    ?? null,
      check:       rd.check       ?? null,
      ingredients: rd.ingredients ?? [],
      result:      rd.result      ?? null,
      bookId:      RecipeStore._getContainerId(item),
      critQualityNames: rd.critQualityNames === true,
      mastery:     RecipeStore._normalizeMasteryFromData(rd.mastery),
      worldSourceId: getModuleFlag(item, "worldSourceId") ?? null,
    };
  }

  static getAll() {
    return game.items
      .filter(i => isRecipeItem(i))
      .map(i => RecipeStore._itemToRecipe(i));
  }

  static get(id) {
    const item = game.items.get(id);
    if (!item || !isRecipeItem(item)) return null;
    return RecipeStore._itemToRecipe(item);
  }

  static getForActor(actor) {
    const all = actor.items.filter(i => isRecipeItem(i));
    const valid = all.filter(i => {
      const cid = RecipeStore._getContainerId(i);
      return !cid || actor.items.has(cid);
    });
    const byWorldId = new Map();
    const noSource = [];
    for (const item of valid) {
      const wsid = getModuleFlag(item, "worldSourceId");
      if (!wsid) { noSource.push(item); continue; }
      const existing = byWorldId.get(wsid);
      if (!existing) { byWorldId.set(wsid, item); continue; }
      if (RecipeStore._getContainerId(existing) && !RecipeStore._getContainerId(item)) {
        byWorldId.set(wsid, item);
      }
    }
    return [...noSource, ...byWorldId.values()].map(i => RecipeStore._itemToRecipe(i));
  }

  static getBooksForActor(actor) {
    return actor.items
      .filter(i => isRecipeBookItem(i))
      .map(i => ({ id: i.id, name: i.name, img: i.img }));
  }

  static getBooks() {
    return game.items
      .filter(i => isRecipeBookItem(i))
      .map(i => ({ id: i.id, name: i.name, img: i.img }));
  }

  static getBook(id) {
    const item = game.items.get(id);
    if (!item || !isRecipeBookItem(item)) return null;
    return { id: item.id, name: item.name, img: item.img };
  }

  static async save(recipe) {
    const adapter = getAdapter();
    const recipeData = {
      category:    recipe.category    ?? null,
      check:       recipe.check       ?? null,
      ingredients: recipe.ingredients ?? [],
      result:      recipe.result      ?? null,
      critQualityNames: recipe.critQualityNames === true,
      mastery:     RecipeStore._normalizeMasteryForSave(recipe.mastery),
    };

    if (recipe.id) {
      const item = game.items.get(recipe.id);
      if (!item) throw new Error(`AdventureCraft | Recipe item ${recipe.id} not found`);
      await item.update({
        name: recipe.name,
        img:  recipe.result?.img ?? item.img,
        [`flags.${CORE_ID}.recipeData`]: recipeData,
      });
      await adapter.applyRecipeBookLinkUpdate(item, recipe.bookId || null);
      return RecipeStore._itemToRecipe(game.items.get(recipe.id));
    }

    const itemCreateData = {
      name:  recipe.name,
      type:  adapter.getRecipeItemType(),
      img:   recipe.result?.img ?? "icons/svg/item-bag.svg",
      flags: { [CORE_ID]: { isRecipe: true, recipeData } },
    };
    adapter.applyRecipeBookLinkToCreateData(itemCreateData, recipe.bookId);
    const created = await Item.create(itemCreateData);

    const rd = foundry.utils.deepClone(recipeData);
    if (rd.result) {
      rd.result.flags ??= {};
      rd.result.flags[CORE_ID] ??= {};
      rd.result.flags[CORE_ID].recipeId = created.id;
      await created.update({ [`flags.${CORE_ID}.recipeData`]: rd });
    }
    return RecipeStore._itemToRecipe(game.items.get(created.id));
  }

  static async delete(id) {
    const item = game.items.get(id);
    if (item) await item.delete();
  }

  static async saveBook(book) {
    const adapter = getAdapter();
    if (book.id) {
      const item = game.items.get(book.id);
      if (!item) throw new Error(`AdventureCraft | Book item ${book.id} not found`);
      await item.update({ name: book.name, ...(book.img ? { img: book.img } : {}) });
      return { id: item.id, name: item.name, img: item.img };
    }
    const created = await Item.create({
      name:  book.name,
      type:  adapter.getBookItemType(),
      img:   book.img ?? "icons/svg/book.svg",
      flags: { [CORE_ID]: { isRecipeBook: true } },
    });
    return { id: created.id, name: created.name, img: created.img };
  }

  static async deleteBook(bookId) {
    const adapter = getAdapter();
    const recipesInBook = game.items.filter(i =>
      isRecipeItem(i) && RecipeStore._getContainerId(i) === bookId,
    );
    for (const ri of recipesInBook) {
      await adapter.clearRecipeBookLink(ri);
    }
    const bookItem = game.items.get(bookId);
    if (bookItem) await bookItem.delete();
  }
}
