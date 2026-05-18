/**
 * GM macro: mark the selected Actor as an AdventureCraft station and set tier (1–5).
 * Run from a macro on the hotbar; requires a single selected token or actor.
 */
const CORE = "adventurecraft-core";

async function setStationFlags() {
  const actor = canvas?.tokens?.controlled?.[0]?.actor ?? game.actors?.find(a => a.isOwner && a.sheet?.rendered);
  if (!actor) {
    ui.notifications.warn("Select a token or open an actor sheet.");
    return;
  }
  if (!game.user.isGM) {
    ui.notifications.warn("GM only.");
    return;
  }

  const current = actor.getFlag(CORE, "station")?.tier ?? 1;
  const content = `<form>
    <div class="form-group">
      <label>Station tier (1–5)</label>
      <input type="number" name="tier" value="${current}" min="1" max="5" style="width:100%"/>
    </div>
  </form>`;

  const tier = await Dialog.prompt({
    title: `AdventureCraft station: ${actor.name}`,
    content,
    label: "Apply",
    callback: html => Math.min(5, Math.max(1, Number(html.find('[name="tier"]').val()) || 1)),
    rejectClose: false,
  });
  if (!tier) return;

  await actor.update({
    [`flags.${CORE}.isStation`]: true,
    [`flags.${CORE}.station`]: { tier },
  });
  ui.notifications.info(`Station set: ${actor.name} (tier ${tier})`);
}

setStationFlags();
