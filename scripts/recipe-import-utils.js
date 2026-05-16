const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_RECIPES = 1000;
const MAX_INGREDIENTS = 64;

/**
 * @param {string} text
 * @returns {object[]}
 */
export function parseRecipeImportJson(text) {
  if (typeof text !== "string" || text.length > MAX_IMPORT_BYTES) {
    throw new Error("Import file too large");
  }
  const data = JSON.parse(text);
  const rawList = Array.isArray(data) ? data : Object.values(data ?? {});
  if (!Array.isArray(rawList) || rawList.length > MAX_IMPORT_RECIPES) {
    throw new Error("Too many recipes in import file");
  }
  return rawList.map(sanitizeImportedRecipe).filter(Boolean);
}

/** @param {unknown} raw */
function sanitizeImportedRecipe(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;

  const recipe = {
    name: name.slice(0, 256),
    ingredients: sanitizeIngredients(raw.ingredients),
    critQualityNames: raw.critQualityNames === true,
  };

  const category = raw.category != null ? String(raw.category).trim() : "";
  if (category) recipe.category = category.slice(0, 128);

  if (raw.bookId) recipe.bookId = String(raw.bookId);

  if (raw.check && typeof raw.check === "object" && !Array.isArray(raw.check)) {
    recipe.check = foundry.utils.deepClone(raw.check);
  }
  if (raw.result && typeof raw.result === "object" && !Array.isArray(raw.result)) {
    recipe.result = foundry.utils.deepClone(raw.result);
  }
  if (raw.mastery && typeof raw.mastery === "object" && !Array.isArray(raw.mastery)) {
    recipe.mastery = foundry.utils.deepClone(raw.mastery);
  }

  return recipe;
}

/** @param {unknown} ings */
function sanitizeIngredients(ings) {
  if (!Array.isArray(ings)) return [];
  return ings.slice(0, MAX_INGREDIENTS).map((ing) => {
    if (!ing || typeof ing !== "object" || Array.isArray(ing)) return null;
    const ingName = typeof ing.name === "string" ? ing.name.trim() : "";
    if (!ingName) return null;
    const out = {
      name: ingName.slice(0, 256),
      quantity: Math.max(1, Math.min(9999, Number(ing.quantity) || 1)),
    };
    if (Array.isArray(ing.tags)) {
      out.tags = ing.tags.map(String).filter(Boolean).slice(0, 16);
    }
    if (ing.img) out.img = String(ing.img).slice(0, 512);
    if (ing.uuid) out.uuid = String(ing.uuid);
    return out;
  }).filter(Boolean);
}
