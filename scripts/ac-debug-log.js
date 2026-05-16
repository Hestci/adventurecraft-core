import { CORE_ID } from "./constants.js";

const _clog = console.log.bind(console);
const _cwarn = console.warn.bind(console);
const _cgrp = console.group.bind(console);
const _cend = console.groupEnd.bind(console);

export const _log = {
  get _on() {
    try {
      return game.settings.get(CORE_ID, "debugLogging");
    } catch {
      return false;
    }
  },
  log(...a) {
    if (this._on) _clog(...a);
  },
  warn(...a) {
    if (this._on) _cwarn(...a);
  },
  group(...a) {
    if (this._on) _cgrp(...a);
  },
  end() {
    if (this._on) _cend();
  },
};
