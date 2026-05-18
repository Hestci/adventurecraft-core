/**
 * Guards for craft/combine: only the actor owner (or GM) may spend inventory.
 * @param {Actor|null|undefined} actor
 * @returns {boolean}
 */
export function assertActorCanCraft(actor) {
  if (!actor) return false;
  if (game.user.isGM) return true;
  return actor.isOwner;
}

export function denyCraftActor() {
  ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.NotActorOwner"));
}
