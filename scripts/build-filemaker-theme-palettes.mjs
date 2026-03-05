#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const CATALOG_PATH = path.join(process.cwd(), "data", "filemaker-theme-catalog.json");
const THEMES_DIR = path.join(process.cwd(), "data", "filemaker-themes");
const OUTPUT_PATHS = [
  path.join(process.cwd(), "data", "filemaker-theme-palettes.json"),
  path.join(process.cwd(), "src", "lib", "filemaker-theme-palettes.json")
];

const FALLBACK_PALETTE = {
  canvas: "#d5d7dd",
  surface: "#eceef3",
  surfaceAlt: "#f4f6fa",
  border: "#b9c0ca",
  text: "#1f2937",
  mutedText: "#6b7280",
  inputBackground: "transparent",
  inputBorder: "#b9c0ca",
  inputText: "#111827",
  buttonBackground: "#4a515a",
  buttonBorder: "#40474f",
  buttonText: "#f3f4f6",
  portalBackground: "#eef1f6",
  portalBorder: "#c5ccd8",
  accent: "#2563eb"
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeColorToken(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/i);
  return match ? match[1].trim() : "";
}

function findSelectorBlocks(css, selector) {
  const selectorPattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\}`, "gi");
  const blocks = [];
  let match = selectorPattern.exec(css);
  while (match) {
    blocks.push(match[1]);
    match = selectorPattern.exec(css);
  }
  return blocks;
}

function findColorInBlock(block, properties) {
  for (const property of properties) {
    const propertyPattern = new RegExp(`${escapeRegExp(property)}\\s*:\\s*([^;]+)`, "i");
    const match = block.match(propertyPattern);
    if (!match) {
      continue;
    }
    const color = normalizeColorToken(match[1]);
    if (color) {
      return color;
    }
  }
  return "";
}

function findColorBySelectors(css, selectors, properties) {
  for (const selector of selectors) {
    const blocks = findSelectorBlocks(css, selector);
    for (const block of blocks) {
      const color = findColorInBlock(block, properties);
      if (color) {
        return color;
      }
    }
  }
  return "";
}

function collectCssColors(css) {
  const colors = [];
  const seen = new Set();
  const pattern = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g;
  let match = pattern.exec(css);
  while (match) {
    const color = match[1].trim();
    const token = color.toLowerCase();
    if (!seen.has(token)) {
      seen.add(token);
      colors.push(color);
    }
    match = pattern.exec(css);
  }
  return colors;
}

function colorToRgba(color) {
  const value = color.trim();
  if (!value) {
    return null;
  }
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const token = hex[1];
    if (token.length === 3) {
      const r = Number.parseInt(token[0] + token[0], 16);
      const g = Number.parseInt(token[1] + token[1], 16);
      const b = Number.parseInt(token[2] + token[2], 16);
      return { r, g, b, a: 1 };
    }
    if (token.length === 6) {
      const r = Number.parseInt(token.slice(0, 2), 16);
      const g = Number.parseInt(token.slice(2, 4), 16);
      const b = Number.parseInt(token.slice(4, 6), 16);
      return { r, g, b, a: 1 };
    }
    const r = Number.parseInt(token.slice(0, 2), 16);
    const g = Number.parseInt(token.slice(2, 4), 16);
    const b = Number.parseInt(token.slice(4, 6), 16);
    const a = Number.parseInt(token.slice(6, 8), 16) / 255;
    return { r, g, b, a };
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) {
    return null;
  }
  const parts = rgb[1].split(",").map((part) => part.trim());
  if (parts.length < 3) {
    return null;
  }
  const r = Number.parseFloat(parts[0]);
  const g = Number.parseFloat(parts[1]);
  const b = Number.parseFloat(parts[2]);
  const a = parts.length >= 4 ? Number.parseFloat(parts[3]) : 1;
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b) || !Number.isFinite(a)) {
    return null;
  }
  return {
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: Math.max(0, Math.min(255, b)),
    a: Math.max(0, Math.min(1, a))
  };
}

function rgbaToCss({ r, g, b, a }) {
  const round = (value) => Math.max(0, Math.min(255, Math.round(value)));
  const alpha = Math.max(0, Math.min(1, Number(a)));
  if (alpha >= 0.999) {
    return `rgb(${round(r)} ${round(g)} ${round(b)})`;
  }
  return `rgb(${round(r)} ${round(g)} ${round(b)} / ${alpha.toFixed(3)})`;
}

function mixColors(a, b, ratio) {
  const left = colorToRgba(a);
  const right = colorToRgba(b);
  if (!left || !right) {
    return a || b || "";
  }
  const weight = Math.max(0, Math.min(1, ratio));
  return rgbaToCss({
    r: left.r + (right.r - left.r) * weight,
    g: left.g + (right.g - left.g) * weight,
    b: left.b + (right.b - left.b) * weight,
    a: left.a + (right.a - left.a) * weight
  });
}

function brightness(color) {
  const parsed = colorToRgba(color);
  if (!parsed) {
    return 255;
  }
  return 0.299 * parsed.r + 0.587 * parsed.g + 0.114 * parsed.b;
}

function contrastText(background, fallbackLight, fallbackDark) {
  return brightness(background) > 145 ? fallbackDark : fallbackLight;
}

function parseThemePalette(css) {
  const colors = collectCssColors(css);
  const firstColor = colors[0] ?? "";

  const canvas =
    findColorBySelectors(css, ["body .self"], ["-fm-table-background-color", "background-color", "background"]) ||
    firstColor ||
    FALLBACK_PALETTE.canvas;
  const surface =
    findColorBySelectors(css, ["body_alt .self", "body .self"], ["-fm-table-background-color", "background-color"]) ||
    mixColors(canvas, "#ffffff", 0.35) ||
    FALLBACK_PALETTE.surface;
  const surfaceAlt = mixColors(surface, "#ffffff", 0.22) || FALLBACK_PALETTE.surfaceAlt;

  const border =
    findColorBySelectors(css, ["field .baseline", "field .self"], ["border-bottom-color", "border-color"]) ||
    mixColors(surface, "#000000", 0.25) ||
    FALLBACK_PALETTE.border;
  const text =
    findColorBySelectors(css, ["field text_box .self", "text_box .self"], ["color"]) ||
    contrastText(surface, "#f3f4f6", "#1f2937");
  const mutedText = mixColors(text, surface, 0.35) || FALLBACK_PALETTE.mutedText;

  const inputBackground =
    findColorBySelectors(css, ["field .self", "edit_box .self"], ["background-color", "background"]) ||
    (brightness(surface) > 145 ? "transparent" : mixColors(surfaceAlt, "#000000", 0.15)) ||
    FALLBACK_PALETTE.inputBackground;
  const inputBorder = border || FALLBACK_PALETTE.inputBorder;
  const inputText =
    findColorBySelectors(css, ["field text_box .self"], ["color"]) ||
    text ||
    FALLBACK_PALETTE.inputText;

  const accent =
    findColorBySelectors(
      css,
      ["title_header .self", "header .self", "leading_grand_summary .self"],
      ["-fm-table-background-color", "background-color", "background"]
    ) ||
    findColorBySelectors(css, ["button .self"], ["background-color", "background"]) ||
    FALLBACK_PALETTE.accent;

  const buttonBackground =
    findColorBySelectors(css, ["button .self"], ["background-color", "background"]) ||
    mixColors(accent, "#000000", 0.22) ||
    FALLBACK_PALETTE.buttonBackground;
  const buttonBorder =
    findColorBySelectors(css, ["button .self"], ["border-color"]) ||
    mixColors(buttonBackground, "#000000", 0.3) ||
    FALLBACK_PALETTE.buttonBorder;
  const buttonText =
    findColorBySelectors(css, ["button text_box .self", "button .self"], ["color"]) ||
    contrastText(buttonBackground, "#f8fafc", "#111827");

  return {
    canvas,
    surface,
    surfaceAlt,
    border,
    text,
    mutedText,
    inputBackground,
    inputBorder,
    inputText,
    buttonBackground,
    buttonBorder,
    buttonText,
    portalBackground: mixColors(surface, surfaceAlt, 0.58) || FALLBACK_PALETTE.portalBackground,
    portalBorder: mixColors(border, surface, 0.25) || FALLBACK_PALETTE.portalBorder,
    accent
  };
}

async function main() {
  const rawCatalog = await fs.readFile(CATALOG_PATH, "utf8");
  const catalog = JSON.parse(rawCatalog);

  if (!catalog || !Array.isArray(catalog.themes)) {
    throw new Error(`Invalid theme catalog: ${CATALOG_PATH}`);
  }

  const palettesByTheme = {};
  for (const theme of catalog.themes) {
    const themeName = String(theme.name ?? "").trim();
    const themeToken = String(theme.token ?? "").trim();
    const cssFile = String(theme.cssFile ?? "").trim();
    if (!themeName || !themeToken || !cssFile) {
      continue;
    }

    const cssPath = path.join(THEMES_DIR, themeToken, cssFile);
    let css = "";
    try {
      css = await fs.readFile(cssPath, "utf8");
    } catch {
      palettesByTheme[themeName] = FALLBACK_PALETTE;
      continue;
    }

    palettesByTheme[themeName] = parseThemePalette(css);
  }

  if (!palettesByTheme["Universal Touch"]) {
    palettesByTheme["Universal Touch"] = FALLBACK_PALETTE;
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceCatalog: CATALOG_PATH,
    palettesByTheme
  };

  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  for (const outputPath of OUTPUT_PATHS) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, serialized, "utf8");
  }

  console.log(`Generated ${Object.keys(palettesByTheme).length} theme palette(s).`);
  for (const outputPath of OUTPUT_PATHS) {
    console.log(`- ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
