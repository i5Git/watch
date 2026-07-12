import fs from "node:fs";
import path from "node:path";
import config from "./config.ts";

export interface SiteSettings {
  brandName: string;
  landingEnabled: boolean;
}

const defaults: SiteSettings = {
  brandName: "Watch",
  landingEnabled: true,
};

const resolveDataPath = (value: string) =>
  path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);

const dataDirectory = resolveDataPath(String(config.AUTH_DATA_DIR || "data"));
const settingsFile = path.join(dataDirectory, "site-settings.json");

const sanitize = (input: Partial<SiteSettings>): SiteSettings => {
  const brandName = String(input.brandName ?? defaults.brandName)
    .trim()
    .slice(0, 50);
  return {
    brandName: brandName || defaults.brandName,
    landingEnabled:
      typeof input.landingEnabled === "boolean"
        ? input.landingEnabled
        : defaults.landingEnabled,
  };
};

export const getSiteSettings = (): SiteSettings => {
  try {
    return sanitize(JSON.parse(fs.readFileSync(settingsFile, "utf8")));
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.warn("Unable to read site settings:", error);
    }
    return defaults;
  }
};

export const updateSiteSettings = (
  updates: Partial<SiteSettings>,
): SiteSettings => {
  const settings = sanitize({ ...getSiteSettings(), ...updates });
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporaryFile = `${settingsFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(settings, null, 2), "utf8");
  fs.renameSync(temporaryFile, settingsFile);
  return settings;
};
