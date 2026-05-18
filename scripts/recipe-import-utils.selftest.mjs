import { parseRecipeImportJson } from "./recipe-import-utils.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Minimal recipe
const ok = parseRecipeImportJson(JSON.stringify([{
  name: "Potion",
  ingredients: [{ name: "Herb", quantity: 2 }],
  check: { type: "skill", key: "med", dc: 12, critThreshold: 5 },
  result: { name: "Healing", type: "consumable", system: { quantity: 1 } },
}]));
assert(ok.length === 1, "valid import");
assert(ok[0].check.type === "skill", "check type preserved");
assert(ok[0].result.system.quantity === 1, "result system pruned");

// __proto__ poison
const poisoned = parseRecipeImportJson(JSON.stringify([{
  name: "Bad",
  ingredients: [],
  __proto__: { polluted: true },
}]));
assert(poisoned.length === 1 && !("polluted" in poisoned[0]), "strips __proto__ on recipe");

// Oversized result (many keys survive pruning but exceed JSON cap)
let threw = false;
try {
  const big = {};
  for (let i = 0; i < 128; i++) big[`k${i}`] = "x".repeat(600);
  parseRecipeImportJson(JSON.stringify([{
    name: "Huge",
    ingredients: [],
    result: { name: "X", type: "loot", system: big },
  }]));
} catch (e) {
  threw = e.message.includes("too large");
}
assert(threw, "rejects oversized result");

// Extra check keys dropped
const strict = parseRecipeImportJson(JSON.stringify([{
  name: "R",
  ingredients: [],
  check: { type: "ability", key: "str", dc: 10, evil: "payload" },
}]));
assert(strict[0].check.evil === undefined, "drops unknown check keys");

// Mastery sanitized
const mast = parseRecipeImportJson(JSON.stringify([{
  name: "M",
  ingredients: [],
  check: { type: "skill", key: "med", dc: 10 },
  mastery: { enabled: true, masteryThreshold: 5, tiers: [{ count: 2, dcReduction: 1 }] },
}]));
assert(mast[0].mastery?.enabled === true, "mastery kept");
assert(mast[0].mastery.tiers.length === 1, "mastery tiers");

console.log("recipe-import-utils.selftest.mjs: all passed");
