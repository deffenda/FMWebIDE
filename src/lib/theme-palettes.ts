import type { CSSProperties } from "react";
import themePaletteCatalog from "@/src/lib/filemaker-theme-palettes.json";

export type RuntimeThemePalette = {
  canvas: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  mutedText: string;
  inputBackground: string;
  inputBorder: string;
  inputText: string;
  buttonBackground: string;
  buttonBorder: string;
  buttonText: string;
  portalBackground: string;
  portalBorder: string;
  accent: string;
};

const FALLBACK_THEME_PALETTE: RuntimeThemePalette = {
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

type ThemePaletteCatalog = {
  palettesByTheme?: Record<string, Partial<RuntimeThemePalette>>;
};

function normalizeThemeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function styleToken(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s|/]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/^-+|-+$/g, "");
}

function toPalette(partial: Partial<RuntimeThemePalette> | undefined): RuntimeThemePalette {
  return {
    ...FALLBACK_THEME_PALETTE,
    ...(partial ?? {})
  };
}

const paletteCatalog = (themePaletteCatalog as ThemePaletteCatalog) ?? {};
const palettesByThemeName = paletteCatalog.palettesByTheme ?? {};
const palettesByToken = new Map<string, RuntimeThemePalette>();
for (const [themeName, palette] of Object.entries(palettesByThemeName)) {
  const token = normalizeThemeToken(themeName);
  if (!token) {
    continue;
  }
  palettesByToken.set(token, toPalette(palette));
}

function colorToRgb(color: string): { r: number; g: number; b: number; a: number } | null {
  const value = color.trim();
  if (!value) {
    return null;
  }

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const token = hex[1];
    if (token.length === 3) {
      return {
        r: Number.parseInt(token[0] + token[0], 16),
        g: Number.parseInt(token[1] + token[1], 16),
        b: Number.parseInt(token[2] + token[2], 16),
        a: 1
      };
    }
    if (token.length === 6) {
      return {
        r: Number.parseInt(token.slice(0, 2), 16),
        g: Number.parseInt(token.slice(2, 4), 16),
        b: Number.parseInt(token.slice(4, 6), 16),
        a: 1
      };
    }
    return {
      r: Number.parseInt(token.slice(0, 2), 16),
      g: Number.parseInt(token.slice(2, 4), 16),
      b: Number.parseInt(token.slice(4, 6), 16),
      a: Number.parseInt(token.slice(6, 8), 16) / 255
    };
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

function rgbToCss({ r, g, b, a }: { r: number; g: number; b: number; a: number }): string {
  const round = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  const alpha = Math.max(0, Math.min(1, Number(a)));
  if (alpha >= 0.999) {
    return `rgb(${round(r)} ${round(g)} ${round(b)})`;
  }
  return `rgb(${round(r)} ${round(g)} ${round(b)} / ${alpha.toFixed(3)})`;
}

function mixColors(a: string, b: string, ratio: number): string {
  const left = colorToRgb(a);
  const right = colorToRgb(b);
  if (!left || !right) {
    return a || b || "";
  }
  const weight = Math.max(0, Math.min(1, ratio));
  return rgbToCss({
    r: left.r + (right.r - left.r) * weight,
    g: left.g + (right.g - left.g) * weight,
    b: left.b + (right.b - left.b) * weight,
    a: left.a + (right.a - left.a) * weight
  });
}

function brightness(color: string): number {
  const parsed = colorToRgb(color);
  if (!parsed) {
    return 255;
  }
  return 0.299 * parsed.r + 0.587 * parsed.g + 0.114 * parsed.b;
}

function contrastText(background: string): string {
  return brightness(background) > 145 ? "#0f172a" : "#f8fafc";
}

export function resolveRuntimeThemePalette(themeName: string | undefined): RuntimeThemePalette {
  const token = normalizeThemeToken(themeName ?? "");
  if (!token) {
    return FALLBACK_THEME_PALETTE;
  }
  return palettesByToken.get(token) ?? FALLBACK_THEME_PALETTE;
}

function applyStyleVariant(palette: RuntimeThemePalette, styleName: string | undefined): RuntimeThemePalette {
  const token = styleToken(styleName);
  if (!token) {
    return palette;
  }

  const next: RuntimeThemePalette = {
    ...palette
  };

  if (token.includes("inverted")) {
    next.surface = mixColors(palette.surface, "#000000", 0.56);
    next.surfaceAlt = mixColors(next.surface, "#ffffff", 0.12);
    next.text = contrastText(next.surface);
    next.mutedText = mixColors(next.text, next.surface, 0.4);
    next.inputBackground = mixColors(next.surfaceAlt, "#000000", 0.22);
    next.inputBorder = mixColors(next.surface, "#ffffff", 0.3);
    next.inputText = next.text;
    next.portalBackground = mixColors(next.surface, next.surfaceAlt, 0.55);
    next.portalBorder = next.inputBorder;
    next.buttonBackground = mixColors(palette.buttonBackground, "#000000", 0.28);
    next.buttonBorder = mixColors(next.buttonBackground, "#000000", 0.2);
    next.buttonText = contrastText(next.buttonBackground);
  } else if (token.includes("fill")) {
    next.inputBackground = mixColors(palette.surfaceAlt, "#ffffff", 0.08);
    next.inputBorder = mixColors(palette.inputBorder, "#000000", 0.12);
    next.portalBackground = mixColors(palette.surface, palette.surfaceAlt, 0.5);
    next.portalBorder = mixColors(next.inputBorder, palette.surface, 0.2);
  } else if (token.includes("line") || token.includes("border")) {
    next.inputBackground = "transparent";
    next.inputBorder = mixColors(palette.inputBorder, "#000000", 0.1);
    next.portalBackground = mixColors(palette.surface, "#ffffff", 0.28);
    next.portalBorder = next.inputBorder;
  }

  if (token.includes("secondary")) {
    next.buttonBackground = mixColors(palette.buttonBackground, "#ffffff", 0.08);
    next.buttonBorder = mixColors(next.buttonBackground, "#000000", 0.24);
    next.buttonText = contrastText(next.buttonBackground);
  }

  if (token.includes("minimum")) {
    next.buttonBackground = "transparent";
    next.buttonBorder = "transparent";
    next.buttonText = next.mutedText;
  }

  if (token.includes("highlight")) {
    next.buttonBackground = palette.accent;
    next.buttonBorder = mixColors(palette.accent, "#000000", 0.2);
    next.buttonText = contrastText(palette.accent);
  }

  if (token.includes("knockout")) {
    next.inputBackground = "#ffffff";
    next.inputBorder = mixColors(palette.border, "#000000", 0.15);
    next.portalBackground = mixColors("#ffffff", palette.surfaceAlt, 0.15);
    next.portalBorder = next.inputBorder;
  }

  return next;
}

export function runtimeThemeCssVars(themeName: string | undefined, styleName: string | undefined): CSSProperties {
  const palette = applyStyleVariant(resolveRuntimeThemePalette(themeName), styleName);
  const vars: Record<string, string> = {
    "--runtime-theme-canvas": palette.canvas,
    "--runtime-theme-surface": palette.surface,
    "--runtime-theme-surface-alt": palette.surfaceAlt,
    "--runtime-theme-border": palette.border,
    "--runtime-theme-text": palette.text,
    "--runtime-theme-muted-text": palette.mutedText,
    "--runtime-input-bg": palette.inputBackground,
    "--runtime-input-border": palette.inputBorder,
    "--runtime-input-text": palette.inputText,
    "--runtime-button-bg": palette.buttonBackground,
    "--runtime-button-border": palette.buttonBorder,
    "--runtime-button-text": palette.buttonText,
    "--runtime-portal-bg": palette.portalBackground,
    "--runtime-portal-border": palette.portalBorder,
    "--runtime-theme-accent": palette.accent
  };
  return vars as CSSProperties;
}
