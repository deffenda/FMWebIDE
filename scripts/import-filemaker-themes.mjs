#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), "data", "filemaker-theme-catalog.json");
const DEFAULT_MIRROR_DIR = path.join(process.cwd(), "data", "filemaker-themes");
const APPLICATIONS_DIR = "/Applications";

function parseArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return "";
  }
  const candidate = process.argv[index + 1] ?? "";
  if (!candidate || candidate.startsWith("--")) {
    return "";
  }
  return candidate.trim();
}

function decodeXmlEntities(value) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractTagText(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  if (!match) {
    return "";
  }
  return decodeXmlEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim());
}

function dedupeCaseInsensitive(values) {
  const deduped = [];
  const seen = new Set();
  for (const value of values) {
    const cleaned = value.trim();
    if (!cleaned) {
      continue;
    }
    const token = cleaned.toLowerCase();
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    deduped.push(cleaned);
  }
  return deduped;
}

function normalizeStyleList(values) {
  const deduped = dedupeCaseInsensitive(values);
  const nonDefault = deduped
    .filter((value) => value.toLowerCase() !== "default")
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return ["Default", ...nonDefault];
}

function parseNamedStyles(xml) {
  const block = xml.match(/<namedstyles>([\s\S]*?)<\/namedstyles>/i);
  if (!block) {
    return ["Default"];
  }

  const styles = [];
  const stylePattern = /<([A-Za-z_][\w:.-]*)>([\s\S]*?)<\/\1>/g;
  let match = stylePattern.exec(block[1]);
  while (match) {
    const raw = match[2]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const value = decodeXmlEntities(raw);
    if (value) {
      styles.push(value);
    }
    match = stylePattern.exec(block[1]);
  }

  return normalizeStyleList(styles);
}

async function listFileMakerApps() {
  const entries = await fs.readdir(APPLICATIONS_DIR, { withFileTypes: true });
  const apps = entries
    .filter((entry) => entry.isDirectory() && /^FileMaker Pro.*\.app$/i.test(entry.name))
    .map((entry) => path.join(APPLICATIONS_DIR, entry.name));

  apps.sort((left, right) => {
    const leftName = path.basename(left);
    const rightName = path.basename(right);
    if (leftName === "FileMaker Pro.app") {
      return -1;
    }
    if (rightName === "FileMaker Pro.app") {
      return 1;
    }
    return leftName.localeCompare(rightName, undefined, { sensitivity: "base" });
  });

  return apps;
}

async function findThemesPath(appPath) {
  const themesPath = path.join(appPath, "Contents", "Resources", "Themes");
  try {
    const stat = await fs.stat(themesPath);
    if (stat.isDirectory()) {
      return themesPath;
    }
  } catch {
    // Ignore missing path.
  }
  return "";
}

function safeRelativePath(value) {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    return "";
  }
  return normalized;
}

async function copyThemeFile(themeDir, mirrorThemeDir, relativePath) {
  const safePath = safeRelativePath(relativePath);
  if (!safePath) {
    return false;
  }

  const sourcePath = path.join(themeDir, safePath);
  const destinationPath = path.join(mirrorThemeDir, safePath);

  try {
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(sourcePath, destinationPath);
    return true;
  } catch {
    return false;
  }
}

async function importThemesFromApp({ appPath, outputPath, mirrorDir, mirrorAssets }) {
  const themesPath = await findThemesPath(appPath);
  if (!themesPath) {
    throw new Error(`Could not find a Themes directory under ${appPath}`);
  }

  const themeEntries = await fs.readdir(themesPath, { withFileTypes: true });
  const themes = [];
  const allStyles = new Set();

  for (const entry of themeEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const themeToken = entry.name;
    const themeDir = path.join(themesPath, themeToken);
    const manifestPath = path.join(themeDir, "manifest.xml");
    let manifestXml = "";
    try {
      manifestXml = await fs.readFile(manifestPath, "utf8");
    } catch {
      continue;
    }

    const name = extractTagText(manifestXml, "name") || themeToken;
    const styles = parseNamedStyles(manifestXml);
    for (const style of styles) {
      allStyles.add(style);
    }

    const theme = {
      id: extractTagText(manifestXml, "id"),
      token: themeToken,
      name,
      group: extractTagText(manifestXml, "group"),
      platform: extractTagText(manifestXml, "platform"),
      version: extractTagText(manifestXml, "version"),
      cssFile: extractTagText(manifestXml, "cssfile"),
      preview: extractTagText(manifestXml, "preview"),
      styles
    };
    themes.push(theme);

    if (!mirrorAssets) {
      continue;
    }

    const mirrorThemeDir = path.join(mirrorDir, themeToken);
    await fs.mkdir(mirrorThemeDir, { recursive: true });

    const filesToCopy = new Set(["manifest.xml"]);
    const localManifestFiles = (await fs.readdir(themeDir)).filter(
      (fileName) => /^manifest_[A-Za-z0-9]+\.xml$/i.test(fileName)
    );
    for (const fileName of localManifestFiles) {
      filesToCopy.add(fileName);
    }
    if (theme.cssFile) {
      filesToCopy.add(theme.cssFile);
    }
    if (theme.preview) {
      filesToCopy.add(theme.preview);
    }

    for (const relativePath of filesToCopy) {
      await copyThemeFile(themeDir, mirrorThemeDir, relativePath);
    }
  }

  themes.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const stylesByTheme = {};
  const themeNames = [];
  for (const theme of themes) {
    themeNames.push(theme.name);
    stylesByTheme[theme.name] = normalizeStyleList(theme.styles);
  }

  const catalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceApp: {
      name: path.basename(appPath),
      path: appPath,
      themesPath
    },
    themes,
    themeNames,
    stylesByTheme,
    allStyles: normalizeStyleList([...allStyles])
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

  return {
    outputPath,
    themesPath,
    themeCount: themes.length
  };
}

async function main() {
  const explicitApp = parseArgValue("--app");
  const outputPath = parseArgValue("--output") || DEFAULT_OUTPUT_PATH;
  const mirrorDir = parseArgValue("--mirror-dir") || DEFAULT_MIRROR_DIR;
  const mirrorAssets = !process.argv.includes("--no-mirror");

  const selectedApp =
    explicitApp ||
    (await (async () => {
      const apps = await listFileMakerApps();
      return apps[0] ?? "";
    })());

  if (!selectedApp) {
    throw new Error("No FileMaker Pro app installation found in /Applications.");
  }

  const result = await importThemesFromApp({
    appPath: selectedApp,
    outputPath,
    mirrorDir,
    mirrorAssets
  });

  console.log(`Imported ${result.themeCount} FileMaker themes from ${selectedApp}`);
  console.log(`Theme catalog: ${result.outputPath}`);
  if (mirrorAssets) {
    console.log(`Theme assets mirror: ${mirrorDir}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
