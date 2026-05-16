import { getAdapter } from "./api/system-adapter.js";

export function normalizePoolEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const t = raw.type ?? "qty";
  const label = raw.label != null && String(raw.label).trim() ? String(raw.label).trim() : undefined;
  const withLabel = (o) => (label ? { ...o, label } : o);

  if (t === "qty") return withLabel({ type: "qty", qty: Math.max(1, Number(raw.qty) || 1) });
  if (t === "property") {
    const prop = String(raw.property ?? "").trim();
    if (!prop) return null;
    return withLabel({
      type: "property",
      property: prop,
      value: Number(raw.value) || 1,
      mode: raw.mode === "set" ? "set" : "add",
    });
  }
  if (t === "damage") {
    const damageFormula = String(raw.damageFormula ?? "").trim();
    if (!damageFormula) return null;
    const dmgTypes = Array.isArray(raw.damageTypes)
      ? raw.damageTypes
      : (raw.damageType ? [raw.damageType] : []);
    return withLabel({
      type: "damage",
      damageFormula,
      ...(dmgTypes.length ? { damageTypes: dmgTypes.map(String) } : {}),
    });
  }
  if (t === "itemProperty") {
    const propertyKey = String(raw.propertyKey ?? "").trim();
    if (!propertyKey) return null;
    return withLabel({ type: "itemProperty", propertyKey });
  }
  return null;
}

export function formatPoolOptionLabel(opt) {
  const label = opt.label?.trim?.();
  if (label) return label;
  if (opt.type === "qty") return `+${opt.qty}`;
  if (opt.type === "property") {
    return game.i18n.format("ADVENTURECRAFT.CritPool.LabelProperty", {
      prop: opt.property,
      value: opt.value,
      mode: opt.mode === "set" ? game.i18n.localize("ADVENTURECRAFT.PropertyMode.Set") : game.i18n.localize("ADVENTURECRAFT.PropertyMode.Add"),
    });
  }
  if (opt.type === "damage") {
    const dList = Array.isArray(opt.damageTypes) ? opt.damageTypes : [];
    return game.i18n.format("ADVENTURECRAFT.CritPool.LabelDamage", {
      formula: opt.damageFormula,
      dmgType: dList.length ? dList.join(", ") : "—",
    });
  }
  if (opt.type === "itemProperty") {
    let propLabel = opt.propertyKey;
    try {
      propLabel = getAdapter().formatItemPropertyLabel?.(opt.propertyKey) ?? opt.propertyKey;
    } catch { /* no adapter */ }
    return game.i18n.format("ADVENTURECRAFT.CritPool.LabelItemProperty", { property: propLabel });
  }
  return "?";
}

export function validateCritPoolConfig(cs) {
  if (!cs || cs.type !== "pool") return null;
  const options = Array.isArray(cs.options) ? cs.options : [];
  if (options.length < 1) return game.i18n.localize("ADVENTURECRAFT.Error.CritPoolEmpty");
  for (let i = 0; i < options.length; i++) {
    if (!normalizePoolEntry(options[i])) {
      return game.i18n.format("ADVENTURECRAFT.Error.CritPoolInvalidOption", { index: i + 1 });
    }
  }
  const sr = cs.sizeRoll;
  if (sr?.formula?.trim()) {
    const table = Array.isArray(sr.table) ? sr.table : [];
    if (!table.length) return game.i18n.localize("ADVENTURECRAFT.Error.CritPoolSizeTable");
    for (let r = 0; r < table.length; r++) {
      const row = table[r];
      const min = Number(row?.min);
      const max = Number(row?.max);
      const count = Number(row?.count);
      if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(count)) {
        return game.i18n.format("ADVENTURECRAFT.Error.CritPoolSizeRow", { row: r + 1 });
      }
      if (min > max) return game.i18n.format("ADVENTURECRAFT.Error.CritPoolSizeRowRange", { row: r + 1 });
    }
  }
  return null;
}

export async function pickCritPoolOption(recipe) {
  const cs = recipe.check?.critSuccess;
  if (!cs || cs.type !== "pool") return null;

  const rawOpts = Array.isArray(cs.options) ? cs.options : [];
  const normalized = rawOpts.map(o => normalizePoolEntry(o)).filter(Boolean);
  if (!normalized.length) return null;
  if (normalized.length === 1) return normalized[0];

  let slotCount = Math.max(1, Number(cs.presentCount) || 3);
  const sr = cs.sizeRoll;
  if (sr?.formula?.trim() && Array.isArray(sr.table) && sr.table.length) {
    try {
      const roll = new Roll(sr.formula.trim());
      await roll.evaluate();
      const total = roll.total;
      const row = sr.table.find(r => total >= Number(r.min) && total <= Number(r.max));
      if (row) slotCount = Math.max(1, Number(row.count) || slotCount);
    } catch (e) {
      console.warn("AdventureCraft | crit pool size roll failed:", e);
    }
  }

  const mode = cs.presentMode ?? "randomSubset";
  let pool = [...normalized];
  if (mode === "randomSubset") {
    pool = foundry.utils.shuffle(pool);
    slotCount = Math.min(slotCount, pool.length);
    pool = pool.slice(0, slotCount);
  }

  if (pool.length === 1) return pool[0];

  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };

    const buttons = {};
    pool.forEach((opt, i) => {
      buttons[`opt${i}`] = {
        label: formatPoolOptionLabel(opt),
        callback: () => done(opt),
      };
    });
    buttons.skip = {
      label: game.i18n.localize("ADVENTURECRAFT.Dialog.CritPoolSkip"),
      callback: () => done(null),
    };

    new Dialog(
      {
        title: game.i18n.localize("ADVENTURECRAFT.Dialog.CritPoolTitle"),
        content: `<p>${game.i18n.localize("ADVENTURECRAFT.Dialog.CritPoolContent")}</p>`,
        buttons,
        default: "opt0",
        close: () => done(null),
      },
      { width: 420 },
    ).render(true);
  });
}
