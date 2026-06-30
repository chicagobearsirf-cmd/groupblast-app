import AdmZip from "adm-zip";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const extensionFolderName = "facebook-group-capture-extension";
export const extensionDir = resolve(process.cwd(), "extensions", extensionFolderName);
export const extensionZipFileName = `${extensionFolderName}.zip`;
export const getZipPath = () => resolve(process.cwd(), "dist", extensionZipFileName);

// OS droppings and editor junk that must never ship in the ZIP, even if they
// appear in the folder later (Finder creates .DS_Store just from browsing).
const junkNames = new Set(["thumbs.db", "desktop.ini"]);
const isJunkEntry = (path: string) =>
  path
    .split(/[\\/]/)
    .filter(Boolean)
    .some((part) => part.startsWith(".") || junkNames.has(part.toLowerCase()));

export const listExtensionFiles = () =>
  existsSync(extensionDir)
    ? readdirSync(extensionDir)
        .filter((name) => !isJunkEntry(name))
        .sort()
    : [];

export const readExtensionManifest = (): {
  name: string;
  version: string;
  manifestVersion: number;
} => {
  try {
    const manifest = JSON.parse(readFileSync(join(extensionDir, "manifest.json"), "utf8")) as {
      name?: string;
      version?: string;
      manifest_version?: number;
    };
    return {
      name: manifest.name ?? "Facebook Group Capture",
      version: manifest.version ?? "",
      manifestVersion: manifest.manifest_version ?? 3,
    };
  } catch {
    return { name: "Facebook Group Capture", version: "", manifestVersion: 3 };
  }
};

// The zip keeps a top-level extension folder so "unzip + Load unpacked" works
// without hunting for loose files.
export const buildExtensionZip = (): Buffer => {
  if (!existsSync(join(extensionDir, "manifest.json"))) {
    throw new Error(
      `Chrome extension not found at ${extensionDir} (manifest.json missing). ` +
        "Make sure the repo includes extensions/facebook-group-capture-extension.",
    );
  }
  const zip = new AdmZip();
  zip.addLocalFolder(extensionDir, extensionFolderName, (entryPath) => !isJunkEntry(entryPath));
  return zip.toBuffer();
};
