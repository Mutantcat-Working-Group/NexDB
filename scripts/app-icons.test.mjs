import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ABOUT_ICON_PATH,
  LARGEST_ICNS_FRAME,
  MACOS_DARK_ICON_PATH,
  MACOS_ICON_PATH,
  checkMacosIconMask,
  decodePng,
  readIcnsEntries,
} from "./app-icons.mjs";

// macOS draws whatever shape the bundle icon provides. A full-bleed square
// artwork therefore shows up as a hard-edged square in the Dock, which is the
// regression these tests pin down.
for (const path of [MACOS_ICON_PATH, MACOS_DARK_ICON_PATH]) {
  test(`${path.split("/").pop()} carries the macOS squircle mask`, () => {
    const entries = readIcnsEntries(readFileSync(path));
    for (const type of ["ic10", "ic09", "ic08", "ic07"]) {
      assert.ok(entries.has(type), `missing ${type} frame`);
    }
    checkMacosIconMask(decodePng(entries.get(LARGEST_ICNS_FRAME)), `${path} (${LARGEST_ICNS_FRAME})`);
  });
}

test("the cached about-panel icon stays masked below the icns frames", () => {
  const mask = checkMacosIconMask(decodePng(readFileSync(ABOUT_ICON_PATH)), ABOUT_ICON_PATH);
  assert.equal(mask.width, 512);
});

test("a full-bleed square would be rejected by the same check", () => {
  const size = 64;
  const data = Buffer.alloc(size * size * 4, 255);
  assert.throws(() => checkMacosIconMask({ width: size, height: size, data }, "square"), /macOS icon mask/);
});
