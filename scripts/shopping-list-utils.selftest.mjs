/**
 * Node smoke tests (no Foundry): run with
 * node --test scripts/shopping-list-utils.selftest.mjs
 * Full aggregate tests require Foundry globals.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

function ingredientAggregateKey(ing) {
  if (ing.uuid) return `uuid:${ing.uuid}`;
  const tags = (ing.tags ?? []).slice().sort().join(",");
  return `name:${String(ing.name ?? "").trim()}|tags:${tags}`;
}

function aggregateNeeded(totals, ingredients) {
  for (const ing of ingredients) {
    const key = ingredientAggregateKey(ing);
    const needed = Math.max(1, Math.floor(Number(ing.quantity) || 1));
    totals.set(key, (totals.get(key) ?? 0) + needed);
  }
  return totals;
}

describe("shopping list aggregate keys", () => {
  it("dedupes by uuid", () => {
    const totals = new Map();
    aggregateNeeded(totals, [
      { uuid: "Item.abc", name: "Iron", quantity: 2 },
      { uuid: "Item.abc", name: "Iron", quantity: 3 },
    ]);
    assert.equal(totals.get("uuid:Item.abc"), 5);
  });

  it("separates same name with different tags", () => {
    const totals = new Map();
    aggregateNeeded(totals, [
      { name: "Ore", tags: ["red"], quantity: 1 },
      { name: "Ore", tags: ["blue"], quantity: 1 },
    ]);
    assert.equal(totals.size, 2);
  });
});
