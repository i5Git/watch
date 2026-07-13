import fs from "node:fs";
import path from "node:path";
import config from "./config.ts";

export type AudioMode = "auto" | "aac" | "copy";

export interface MediaSettings {
  preset: string;
  crf: number;
  segmentLength: number;
  audioMode: AudioMode;
  deleteOriginalAfterConversion: boolean;
  maxConcurrentConversions: number;
}

const allowedPresets = new Set([
  "ultrafast",
  "superfast",
  "veryfast",
  "faster",
  "fast",
  "medium",
  "slow",
  "slower",
  "veryslow",
]);

const defaults: MediaSettings = {
  preset: "veryfast",
  crf: 23,
  segmentLength: 6,
  audioMode: "auto",
  deleteOriginalAfterConversion: false,
  maxConcurrentConversions: 1,
};

const resolveDataPath = (value: string) =>
  path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);

const mediaDirectory = resolveDataPath(
  String(config.MEDIA_DATA_DIR || "data/media"),
);
const settingsFile = path.join(mediaDirectory, "media-settings.json");

const boundedInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
};

const sanitize = (input: Partial<MediaSettings>): MediaSettings => {
  const preset = String(input.preset ?? defaults.preset).toLowerCase();
  const audioMode = String(input.audioMode ?? defaults.audioMode) as AudioMode;
  return {
    preset: allowedPresets.has(preset) ? preset : defaults.preset,
    crf: boundedInteger(input.crf, defaults.crf, 0, 51),
    segmentLength: boundedInteger(
      input.segmentLength,
      defaults.segmentLength,
      2,
      30,
    ),
    audioMode: ["auto", "aac", "copy"].includes(audioMode)
      ? audioMode
      : defaults.audioMode,
    deleteOriginalAfterConversion:
      typeof input.deleteOriginalAfterConversion === "boolean"
        ? input.deleteOriginalAfterConversion
        : defaults.deleteOriginalAfterConversion,
    maxConcurrentConversions: boundedInteger(
      input.maxConcurrentConversions,
      defaults.maxConcurrentConversions,
      1,
      8,
    ),
  };
};

export const getMediaSettings = (): MediaSettings => {
  try {
    return sanitize(JSON.parse(fs.readFileSync(settingsFile, "utf8")));
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.warn("Unable to read media settings:", error);
    }
    return { ...defaults };
  }
};

export const updateMediaSettings = (
  updates: Partial<MediaSettings>,
): MediaSettings => {
  const settings = sanitize({ ...getMediaSettings(), ...updates });
  fs.mkdirSync(mediaDirectory, { recursive: true });
  const temporaryFile = `${settingsFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(settings, null, 2), "utf8");
  fs.renameSync(temporaryFile, settingsFile);
  return settings;
};
