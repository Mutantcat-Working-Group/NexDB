#!/usr/bin/env node
// Regenerates the packaged application icons from the root artwork.
//
// macOS never rounds an application icon for us: the artwork inside
// `src-tauri/icons/icon.icns` has to carry the squircle itself, with fully
// transparent margins, the way every stock system icon does. Running
// `pnpm tauri icon ./icon.png` on the full-bleed source artwork drops that mask
// and the Dock falls back to a hard-edged black square, which is why this
// script exists.
//
// The mask geometry matches the stock system icons on macOS: the content
// square covers 824/1024 of the canvas (100px transparent margin on a 1024px
// canvas) and the corners follow a superellipse with an exponent of about 5.16.
// Both numbers come from measuring `/System/Library/CoreServices/Finder.app`.
//
// Usage: node scripts/app-icons.mjs

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const SOURCE_ICON_PATH = join(REPO_ROOT, "icon.png");
export const MACOS_ICON_PATH = join(REPO_ROOT, "src-tauri/icons/icon.icns");
export const MACOS_DARK_ICON_PATH = join(REPO_ROOT, "src-tauri/icons/icon-macos-dark.icns");
export const ABOUT_ICON_PATH = join(REPO_ROOT, "src-tauri/icons/icon.png");

/** Share of the canvas covered by the icon content, per the macOS icon grid. */
export const MACOS_ICON_CONTENT_RATIO = 824 / 1024;
/** Superellipse exponent that reproduces the stock macOS squircle corners. */
export const MACOS_ICON_EXPONENT = 5.16;

/** Every frame `iconutil` expects inside a `.iconset` bundle. */
const ICONSET_FRAMES = [
  { name: "icon_16x16.png", size: 16 },
  { name: "icon_16x16@2x.png", size: 32 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_32x32@2x.png", size: 64 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_128x128@2x.png", size: 256 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_256x256@2x.png", size: 512 },
  { name: "icon_512x512.png", size: 512 },
  { name: "icon_512x512@2x.png", size: 1024 },
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SUPERSAMPLE = 4;
// Below this alpha a pixel is antialiasing fringe rather than icon content, so
// it must not widen the measured content bounds.
const MASK_ALPHA_THRESHOLD = 64;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function unfilterRow(type, line, prior, bytesPerPixel) {
  const length = line.length;
  switch (type) {
    case 0:
      return;
    case 1:
      for (let i = bytesPerPixel; i < length; i += 1) line[i] = (line[i] + line[i - bytesPerPixel]) & 0xff;
      return;
    case 2:
      for (let i = 0; i < length; i += 1) line[i] = (line[i] + prior[i]) & 0xff;
      return;
    case 3:
      for (let i = 0; i < length; i += 1) {
        const left = i >= bytesPerPixel ? line[i - bytesPerPixel] : 0;
        line[i] = (line[i] + ((left + prior[i]) >> 1)) & 0xff;
      }
      return;
    case 4:
      for (let i = 0; i < length; i += 1) {
        const left = i >= bytesPerPixel ? line[i - bytesPerPixel] : 0;
        const upLeft = i >= bytesPerPixel ? prior[i - bytesPerPixel] : 0;
        line[i] = (line[i] + paeth(left, prior[i], upLeft)) & 0xff;
      }
      return;
    default:
      throw new Error(`unsupported PNG row filter ${type}`);
  }
}

/**
 * Decodes a non-interlaced 8-bit PNG into straight (non-premultiplied) RGBA.
 * Only the encodings the icon pipeline actually produces are supported.
 */
export function decodePng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("input is not a PNG file");
  }
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (!header) throw new Error("PNG is missing its IHDR chunk");
  if (header.bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${header.bitDepth}`);
  if (header.interlace !== 0) throw new Error("interlaced PNG files are not supported");
  const channels = header.colorType === 6 ? 4 : header.colorType === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`unsupported PNG color type ${header.colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const { width, height } = header;
  const stride = width * channels;
  const data = Buffer.alloc(width * height * 4);
  const prior = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  let position = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[position];
    position += 1;
    raw.copy(line, 0, position, position + stride);
    position += stride;
    unfilterRow(filter, line, prior, channels);
    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      data[to] = line[from];
      data[to + 1] = line[from + 1];
      data[to + 2] = line[from + 2];
      data[to + 3] = channels === 4 ? line[from + 3] : 255;
    }
    line.copy(prior);
  }
  return { width, height, data };
}

/** Encodes straight RGBA pixels as an 8-bit non-interlaced PNG. */
export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Box-filter downscale that averages premultiplied colour over fractional edges. */
export function resizeImage(source, size) {
  const { width: sourceWidth, height: sourceHeight } = source;
  const out = Buffer.alloc(size * size * 4);
  const scaleX = sourceWidth / size;
  const scaleY = sourceHeight / size;
  for (let y = 0; y < size; y += 1) {
    const y0 = y * scaleY;
    const y1 = (y + 1) * scaleY;
    for (let x = 0; x < size; x += 1) {
      const x0 = x * scaleX;
      const x1 = (x + 1) * scaleX;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;
      for (let sy = Math.floor(y0); sy < Math.min(sourceHeight, Math.ceil(y1)); sy += 1) {
        const coverageY = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (coverageY <= 0) continue;
        for (let sx = Math.floor(x0); sx < Math.min(sourceWidth, Math.ceil(x1)); sx += 1) {
          const coverageX = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (coverageX <= 0) continue;
          const w = coverageX * coverageY;
          const from = (sy * sourceWidth + sx) * 4;
          const alpha = source.data[from + 3] / 255;
          r += source.data[from] * alpha * w;
          g += source.data[from + 1] * alpha * w;
          b += source.data[from + 2] * alpha * w;
          a += alpha * w;
          weight += w;
        }
      }
      const to = (y * size + x) * 4;
      if (a > 0) {
        out[to] = Math.round(r / a);
        out[to + 1] = Math.round(g / a);
        out[to + 2] = Math.round(b / a);
      }
      out[to + 3] = Math.round((a / weight) * 255);
    }
  }
  return { width: size, height: size, data: out };
}

/** Antialiased coverage of the macOS squircle for one canvas size. */
export function squircleCoverage(size) {
  const half = (size * MACOS_ICON_CONTENT_RATIO) / 2;
  const center = size / 2;
  const coverage = new Float32Array(size * size);
  const samples = SUPERSAMPLE * SUPERSAMPLE;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let inside = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        const v = Math.abs((y + (sy + 0.5) / SUPERSAMPLE - center) / half);
        const vPow = v ** MACOS_ICON_EXPONENT;
        if (vPow > 1) continue;
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const u = Math.abs((x + (sx + 0.5) / SUPERSAMPLE - center) / half);
          if (u ** MACOS_ICON_EXPONENT + vPow <= 1) inside += 1;
        }
      }
      coverage[y * size + x] = inside / samples;
    }
  }
  return coverage;
}

/** Scales the artwork to `size` and applies the macOS squircle as its alpha. */
export function renderMacosIcon(source, size) {
  if (source.width !== source.height) throw new Error("icon artwork must be square");
  const scaled = resizeImage(source, size);
  const coverage = squircleCoverage(size);
  for (let i = 0; i < size * size; i += 1) {
    const alpha = scaled.data[i * 4 + 3];
    scaled.data[i * 4 + 3] = Math.round(alpha * coverage[i]);
  }
  return scaled;
}

/** Splits an `.icns` container into its `type -> payload` entries. */
export function readIcnsEntries(buffer) {
  if (buffer.length < 8 || buffer.toString("latin1", 0, 4) !== "icns") {
    throw new Error("file is not an icns container");
  }
  const entries = new Map();
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("latin1", offset, offset + 4);
    const length = buffer.readUInt32BE(offset + 4);
    if (length < 8 || offset + length > buffer.length) break;
    entries.set(type, buffer.subarray(offset + 8, offset + length));
    offset += length;
  }
  return entries;
}

function alphaAt(image, x, y) {
  return image.data[(y * image.width + x) * 4 + 3];
}

/** Measures the transparent-margin/rounded-corner shape of an icon frame. */
export function measureIconMask(image) {
  const { width, height } = image;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(image, x, y) <= MASK_ALPHA_THRESHOLD) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) throw new Error("icon frame is fully transparent");
  const contentWidth = right - left + 1;
  const contentHeight = bottom - top + 1;
  const sample = (u, v) =>
    alphaAt(image, left + Math.round(u * (contentWidth - 1)), top + Math.round(v * (contentHeight - 1)));
  return {
    width,
    height,
    contentWidth,
    contentHeight,
    inset: { left, top, right: width - 1 - right, bottom: height - 1 - bottom },
    contentRatioX: contentWidth / width,
    contentRatioY: contentHeight / height,
    cornerSamples: [sample(0.05, 0.05), sample(0.95, 0.05), sample(0.05, 0.95), sample(0.95, 0.95)],
    edgeSamples: [sample(0.5, 0.02), sample(0.5, 0.98), sample(0.02, 0.5), sample(0.98, 0.5)],
    centerSample: alphaAt(image, Math.floor(width / 2), Math.floor(height / 2)),
  };
}

/**
 * Asserts an icon frame keeps the macOS shape: transparent margins, a content
 * square near the 824/1024 grid, opaque edges, and carved-out corners.
 */
export function checkMacosIconMask(image, label) {
  const mask = measureIconMask(image);
  const problems = [];
  if (mask.contentRatioX < 0.77 || mask.contentRatioX > 0.84) {
    problems.push(`content width covers ${(mask.contentRatioX * 100).toFixed(1)}% of the canvas`);
  }
  if (Math.abs(mask.contentRatioX - mask.contentRatioY) > 0.01) {
    problems.push("content square is not centred");
  }
  for (const [edge, value] of [
    ["left", mask.inset.left],
    ["top", mask.inset.top],
    ["right", mask.inset.right],
    ["bottom", mask.inset.bottom],
  ]) {
    if (value <= 0) problems.push(`${edge} margin is opaque`);
  }
  if (Math.max(mask.inset.left, mask.inset.right) - Math.min(mask.inset.left, mask.inset.right) > 2) {
    problems.push("horizontal margins are lopsided");
  }
  if (Math.max(mask.inset.top, mask.inset.bottom) - Math.min(mask.inset.top, mask.inset.bottom) > 2) {
    problems.push("vertical margins are lopsided");
  }
  if (Math.max(...mask.cornerSamples) > 8) {
    problems.push(`corners are opaque (${mask.cornerSamples.join("/")})`);
  }
  if (Math.min(...mask.edgeSamples) < 247) {
    problems.push(`edges are clipped (${mask.edgeSamples.join("/")})`);
  }
  if (mask.centerSample < 247) problems.push("icon centre is transparent");
  if (problems.length > 0) {
    throw new Error(`${label} does not use the macOS icon mask: ${problems.join("; ")}`);
  }
  return mask;
}

/** Frames worth validating inside the packaged `.icns` files, largest first. */
export const LARGEST_ICNS_FRAME = "ic10";

function buildIcns(pngBySize) {
  // iconutil only accepts a bundle whose directory name ends in `.iconset`.
  const workspace = mkdtempSync(join(tmpdir(), "nexdb-iconset-"));
  const directory = join(workspace, "NexDB.iconset");
  mkdirSync(directory);
  try {
    for (const { name, size } of ICONSET_FRAMES) {
      writeFileSync(join(directory, name), encodePng(pngBySize.get(size)));
    }
    const output = join(tmpdir(), `nexdb-${process.pid}.icns`);
    execFileSync("iconutil", ["-c", "icns", directory, "-o", output], { stdio: "inherit" });
    const icns = readFileSync(output);
    rmSync(output, { force: true });
    return icns;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

export function generateAppIcons() {
  if (process.platform !== "darwin") {
    throw new Error("regenerating icns files needs macOS (iconutil)");
  }
  const source = decodePng(readFileSync(SOURCE_ICON_PATH));
  if (source.width !== source.height) throw new Error("icon.png must be square");

  const pngBySize = new Map();
  for (const frame of ICONSET_FRAMES) {
    if (!pngBySize.has(frame.size)) pngBySize.set(frame.size, renderMacosIcon(source, frame.size));
  }
  // The 16/32/64px frames quantise the squircle into too few pixels for a
  // meaningful shape measurement; the larger frames share the same formula.
  for (const [size, image] of pngBySize) {
    if (size >= 128) checkMacosIconMask(image, `iconset ${size}px frame`);
  }

  const icns = buildIcns(pngBySize);
  const entries = readIcnsEntries(icns);
  checkMacosIconMask(decodePng(entries.get(LARGEST_ICNS_FRAME)), "generated icon.icns");
  writeFileSync(MACOS_ICON_PATH, icns);
  writeFileSync(MACOS_DARK_ICON_PATH, icns);
  writeFileSync(ABOUT_ICON_PATH, encodePng(pngBySize.get(512)));
  return { bytes: icns.length, sizes: [...pngBySize.keys()].sort((a, b) => a - b) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = generateAppIcons();
  console.log(`Wrote macOS app icons from icon.png (${result.bytes} byte icns, frames ${result.sizes.join(", ")}).`);
}
