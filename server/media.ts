import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type ChildProcess } from "node:child_process";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import config from "./config.ts";
import type { AppUser } from "./auth.ts";
import {
  generateThumbnails,
  getTranscodeBackend,
  probeMedia,
  type ProbedMedia,
  type TranscodeProgress,
} from "./transcoding.ts";
import { getMediaSettings } from "./mediaSettings.ts";

export type MediaStatus =
  "uploading" | "queued" | "converting" | "playable" | "ready" | "failed";

export interface MediaProgress {
  percent: number;
  speed: number;
  etaSeconds: number | null;
  processedSeconds: number;
}

export interface MediaRecord {
  id: string;
  name: string;
  originalName: string;
  filename: string;
  url: string;
  originalUrl?: string;
  hlsUrl?: string;
  posterUrl?: string;
  thumbnailUrl?: string;
  status: MediaStatus;
  converted: boolean;
  owner: string;
  createdAt: string;
  updatedAt?: string;
  size?: number;
  metadata?: ProbedMedia;
  progress?: MediaProgress;
  error?: string;
}

interface ActiveJob {
  child: ChildProcess;
  version: number;
}

const resolveDataPath = (value: string) =>
  path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);

const mediaDirectory = resolveDataPath(
  String(config.MEDIA_DATA_DIR || "data/media"),
);
const indexFile = path.join(mediaDirectory, "index.json");
const settingsFilename = "media-settings.json";
const maxUploadBytes =
  Number(config.UPLOAD_MAX_BYTES) || 20 * 1024 * 1024 * 1024;
const activeJobs = new Map<string, ActiveJob>();
const runningJobs = new Map<string, number>();
const queuedIds: string[] = [];
const jobVersions = new Map<string, number>();
let mediaCacheGeneration = 0;
let queueStarted = false;
let pumping = false;

const ensureMediaDirectory = () => {
  fs.mkdirSync(mediaDirectory, { recursive: true });
};

const readIndex = (): MediaRecord[] => {
  ensureMediaDirectory();
  try {
    const parsed = JSON.parse(fs.readFileSync(indexFile, "utf8"));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((rawRecord: unknown) => {
      const record = rawRecord as any;
      return {
        ...record,
        status:
          record.status === "error" ? "failed" : (record.status as MediaStatus),
      };
    });
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.warn("Unable to read media index:", error);
    }
    return [];
  }
};

const writeRecordMetadata = (record: MediaRecord) => {
  const folder = path.join(mediaDirectory, record.id);
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    return;
  }
  const target = path.join(folder, "metadata.json");
  const temporaryFile = `${target}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(record, null, 2), "utf8");
  fs.renameSync(temporaryFile, target);
};

const writeIndex = (records: MediaRecord[]) => {
  ensureMediaDirectory();
  const temporaryFile = `${indexFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(records, null, 2), "utf8");
  fs.renameSync(temporaryFile, indexFile);
};

const updateRecord = (updated: MediaRecord) => {
  updated.updatedAt = new Date().toISOString();
  const records = readIndex();
  const index = records.findIndex((record) => record.id === updated.id);
  if (index === -1) {
    records.push(updated);
  } else {
    records[index] = updated;
  }
  writeIndex(records);
  writeRecordMetadata(updated);
  return updated;
};

const mutateRecord = (
  id: string,
  mutate: (record: MediaRecord) => void,
): MediaRecord | undefined => {
  const record = readIndex().find((item) => item.id === id);
  if (!record) {
    return undefined;
  }
  mutate(record);
  return updateRecord(record);
};

const removeRecordFromIndex = (id: string) => {
  writeIndex(readIndex().filter((record) => record.id !== id));
};

const safeName = (value: string) => {
  const trimmed = value.trim().replace(/[^\p{L}\p{N}._ -]+/gu, "_");
  return trimmed.replace(/\s+/g, "-").slice(0, 120) || "video";
};

const relativeUrl = (relativePath: string) =>
  `/media/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`;

const absoluteMediaPath = (relativePath: string) =>
  path.join(mediaDirectory, relativePath);

const movieFolder = (id: string) => path.join(mediaDirectory, id);

const mediaForUser = (record: MediaRecord, user: AppUser) =>
  user.role === "admin" || record.owner === user.username;

const nextJobVersion = (id: string) => {
  const version = (jobVersions.get(id) || 0) + 1;
  jobVersions.set(id, version);
  return version;
};

const isCurrentJob = (id: string, version: number, generation: number) =>
  jobVersions.get(id) === version && generation === mediaCacheGeneration;

const segmentCount = (folder: string) => {
  try {
    return fs
      .readdirSync(folder)
      .filter((name) => /^segment_\d{5}\.ts$/.test(name)).length;
  } catch {
    return 0;
  }
};

const removeHlsFiles = (id: string) => {
  const folder = movieFolder(id);
  if (!fs.existsSync(folder)) {
    return;
  }
  for (const name of fs.readdirSync(folder)) {
    if (
      name === "master.m3u8" ||
      name === "master.m3u8.tmp" ||
      /^segment_\d{5}\.ts(?:\.tmp)?$/.test(name)
    ) {
      fs.rmSync(path.join(folder, name), { force: true });
    }
  }
};

const enqueue = (id: string) => {
  if (!queuedIds.includes(id) && !runningJobs.has(id)) {
    queuedIds.push(id);
  }
  void pumpQueue();
};

const setProgress = (
  id: string,
  version: number,
  generation: number,
  progress: TranscodeProgress,
) => {
  if (!isCurrentJob(id, version, generation)) {
    return;
  }
  mutateRecord(id, (record) => {
    record.progress = {
      percent: Number(progress.percent.toFixed(2)),
      speed: Number(progress.speed.toFixed(2)),
      etaSeconds:
        progress.etaSeconds === null
          ? null
          : Math.max(0, Math.round(progress.etaSeconds)),
      processedSeconds: Number(progress.processedSeconds.toFixed(2)),
    };
  });
};

const runConversion = async (id: string) => {
  const generation = mediaCacheGeneration;
  const version = nextJobVersion(id);
  runningJobs.set(id, version);
  const initial = readIndex().find((record) => record.id === id);
  if (!initial?.filename) {
    mutateRecord(id, (record) => {
      record.status = "failed";
      record.error = "The original file is missing.";
    });
    if (runningJobs.get(id) === version) {
      runningJobs.delete(id);
    }
    void pumpQueue();
    return;
  }

  const inputPath = absoluteMediaPath(initial.filename);
  const folder = movieFolder(id);
  if (!fs.existsSync(inputPath)) {
    mutateRecord(id, (record) => {
      record.status = "failed";
      record.error = "The original file is missing.";
    });
    if (runningJobs.get(id) === version) {
      runningJobs.delete(id);
    }
    void pumpQueue();
    return;
  }

  try {
    removeHlsFiles(id);
    mutateRecord(id, (record) => {
      record.status = "converting";
      record.converted = false;
      record.hlsUrl = undefined;
      record.url = record.originalUrl || record.url;
      record.error = undefined;
      record.progress = {
        percent: 0,
        speed: 0,
        etaSeconds: null,
        processedSeconds: 0,
      };
    });

    const metadata = await probeMedia(inputPath, initial.size);
    if (!isCurrentJob(id, version, generation)) {
      return;
    }
    mutateRecord(id, (record) => {
      record.metadata = metadata;
      record.size = metadata.fileSize;
    });
    void generateThumbnails(inputPath, folder, metadata.duration).then(() => {
      if (!isCurrentJob(id, version, generation)) {
        return;
      }
      mutateRecord(id, (record) => {
        if (fs.existsSync(path.join(folder, "poster.jpg"))) {
          record.posterUrl = relativeUrl(path.join(id, "poster.jpg"));
        }
        if (fs.existsSync(path.join(folder, "thumbnail.jpg"))) {
          record.thumbnailUrl = relativeUrl(path.join(id, "thumbnail.jpg"));
        }
      });
    });

    const settings = getMediaSettings();
    let lastProgressWrite = 0;
    const child = getTranscodeBackend().start({
      inputPath,
      outputDirectory: folder,
      metadata,
      settings,
      onProgress: (progress) => {
        const now = Date.now();
        if (now - lastProgressWrite >= 1000 || progress.percent >= 100) {
          lastProgressWrite = now;
          setProgress(id, version, generation, progress);
        }
      },
    });
    activeJobs.set(id, { child, version });
    let errorOutput = "";
    child.stderr?.on("data", (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line && !/^[a-z_]+=/i.test(line)) {
          errorOutput += `${line}\n`;
        }
      }
    });

    const playableSegments = Math.max(
      1,
      Math.ceil(30 / settings.segmentLength),
    );
    const playableWatcher = setInterval(() => {
      if (!isCurrentJob(id, version, generation)) {
        clearInterval(playableWatcher);
        return;
      }
      if (
        segmentCount(folder) >= playableSegments &&
        fs.existsSync(path.join(folder, "master.m3u8"))
      ) {
        mutateRecord(id, (record) => {
          if (record.status === "converting") {
            record.status = "playable";
            record.hlsUrl = relativeUrl(path.join(id, "master.m3u8"));
            record.url = record.hlsUrl;
          }
        });
        clearInterval(playableWatcher);
      }
    }, 1000);

    await new Promise<void>((resolve) => {
      child.once("error", () => resolve());
      child.once("close", () => resolve());
    });
    clearInterval(playableWatcher);
    activeJobs.delete(id);
    if (!isCurrentJob(id, version, generation)) {
      return;
    }

    if (child.exitCode === 0) {
      const hlsUrl = relativeUrl(path.join(id, "master.m3u8"));
      mutateRecord(id, (record) => {
        record.status = "ready";
        record.converted = true;
        record.hlsUrl = hlsUrl;
        record.url = hlsUrl;
        record.error = undefined;
        record.progress = {
          percent: 100,
          speed: record.progress?.speed || 0,
          etaSeconds: 0,
          processedSeconds: metadata.duration,
        };
        if (settings.deleteOriginalAfterConversion && record.filename) {
          fs.rmSync(absoluteMediaPath(record.filename), { force: true });
          record.filename = "";
          record.originalUrl = undefined;
        }
      });
    } else {
      mutateRecord(id, (record) => {
        record.status = "failed";
        record.error =
          errorOutput.trim().slice(-4000) ||
          "FFmpeg could not convert this media file.";
      });
    }
  } catch (error: any) {
    activeJobs.delete(id);
    if (isCurrentJob(id, version, generation)) {
      mutateRecord(id, (record) => {
        record.status = "failed";
        record.error = error?.message || "Media conversion failed.";
      });
    }
  } finally {
    if (runningJobs.get(id) === version) {
      runningJobs.delete(id);
    }
    void pumpQueue();
  }
};

const pumpQueue = async () => {
  if (pumping) {
    return;
  }
  pumping = true;
  try {
    const limit = getMediaSettings().maxConcurrentConversions;
    while (runningJobs.size < limit && queuedIds.length > 0) {
      const id = queuedIds.shift();
      if (!id || runningJobs.has(id)) {
        continue;
      }
      const record = readIndex().find((item) => item.id === id);
      if (!record || record.status !== "queued") {
        continue;
      }
      void runConversion(id);
    }
  } finally {
    pumping = false;
  }
};

export const initializeMediaQueue = () => {
  if (queueStarted) {
    return;
  }
  queueStarted = true;
  const records = readIndex();
  let changed = false;
  for (const record of records) {
    if (record.status === "uploading") {
      record.status = "failed";
      record.error = "The upload was interrupted before it completed.";
      changed = true;
    } else if (
      record.status === "queued" ||
      record.status === "converting" ||
      record.status === "playable"
    ) {
      record.status = "queued";
      record.error = undefined;
      queuedIds.push(record.id);
      changed = true;
    }
  }
  if (changed) {
    writeIndex(records);
    records.forEach(writeRecordMetadata);
  }
  void pumpQueue();
};

export const notifyMediaSettingsChanged = () => {
  void pumpQueue();
};

export const listMedia = (user: AppUser) =>
  readIndex()
    .filter((record) => mediaForUser(record, user))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

export const getMedia = (id: string, user: AppUser) => {
  const record = readIndex().find((item) => item.id === id);
  return record && mediaForUser(record, user) ? record : undefined;
};

export const uploadMedia = async (
  request: NodeJS.ReadableStream & {
    headers?: Record<string, string | string[] | undefined>;
  },
  user: AppUser,
  originalNameInput: unknown,
  _convertToMp4: boolean,
) => {
  ensureMediaDirectory();
  const generation = mediaCacheGeneration;
  const originalName = safeName(String(originalNameInput || "video"));
  const id = crypto.randomUUID();
  const folder = movieFolder(id);
  fs.mkdirSync(folder, { recursive: true });
  const extension = path.extname(originalName).toLowerCase() || ".bin";
  const relativeOriginalPath = path.join(id, `original${extension}`);
  const originalPath = absoluteMediaPath(relativeOriginalPath);
  const timestamp = new Date().toISOString();
  const originalUrl = relativeUrl(relativeOriginalPath);
  const record: MediaRecord = {
    id,
    name: originalName,
    originalName,
    filename: relativeOriginalPath,
    url: originalUrl,
    originalUrl,
    status: "uploading",
    converted: false,
    owner: user.username,
    createdAt: timestamp,
    updatedAt: timestamp,
    size: 0,
    progress: {
      percent: 0,
      speed: 0,
      etaSeconds: null,
      processedSeconds: 0,
    },
  };
  updateRecord(record);
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxUploadBytes) {
        callback(
          new Error("The uploaded file is larger than the configured limit."),
        );
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(request, limiter, fs.createWriteStream(originalPath));
  } catch (error) {
    fs.rmSync(folder, { recursive: true, force: true });
    removeRecordFromIndex(id);
    throw error;
  }
  if (generation !== mediaCacheGeneration) {
    fs.rmSync(folder, { recursive: true, force: true });
    removeRecordFromIndex(id);
    throw new Error(
      "The media cache was cleared while this file was uploading.",
    );
  }

  record.status = "queued";
  record.size = bytes;
  updateRecord(record);
  enqueue(id);
  return record;
};

const requireRecord = (id: string) => {
  const record = readIndex().find((item) => item.id === id);
  if (!record) {
    throw new Error("Media not found.");
  }
  return record;
};

const stopJob = (id: string) => {
  nextJobVersion(id);
  const queuedIndex = queuedIds.indexOf(id);
  if (queuedIndex !== -1) {
    queuedIds.splice(queuedIndex, 1);
  }
  const active = activeJobs.get(id);
  if (active) {
    activeJobs.delete(id);
    active.child.kill("SIGKILL");
  }
  runningJobs.delete(id);
};

export const cancelMediaConversion = (id: string) => {
  requireRecord(id);
  stopJob(id);
  return mutateRecord(id, (record) => {
    record.status = "failed";
    record.error = "Conversion was cancelled by an administrator.";
  });
};

export const retryMediaConversion = (id: string) => {
  const record = requireRecord(id);
  if (!record.filename || !fs.existsSync(absoluteMediaPath(record.filename))) {
    throw new Error("The original file is not available.");
  }
  stopJob(id);
  removeHlsFiles(id);
  const updated = mutateRecord(id, (item) => {
    item.status = "queued";
    item.converted = false;
    item.hlsUrl = undefined;
    item.url = item.originalUrl || item.url;
    item.error = undefined;
    item.progress = {
      percent: 0,
      speed: 0,
      etaSeconds: null,
      processedSeconds: 0,
    };
  });
  enqueue(id);
  return updated;
};

export const rebuildMediaHls = (id: string) => retryMediaConversion(id);

export const deleteMediaHls = (id: string) => {
  const record = requireRecord(id);
  stopJob(id);
  removeHlsFiles(id);
  return mutateRecord(id, (item) => {
    item.hlsUrl = undefined;
    item.converted = false;
    item.url = item.originalUrl || "";
    item.status = item.filename ? "failed" : "failed";
    item.error = item.filename
      ? "HLS output was deleted. Rebuild it to restore playback."
      : "HLS output and the original file are unavailable.";
    item.progress = undefined;
  });
};

export const deleteMediaOriginal = (id: string) => {
  const record = requireRecord(id);
  if (activeJobs.has(id) || record.status === "queued") {
    throw new Error("Cancel the conversion before deleting the original file.");
  }
  if (record.filename) {
    fs.rmSync(absoluteMediaPath(record.filename), { force: true });
  }
  return mutateRecord(id, (item) => {
    item.filename = "";
    item.originalUrl = undefined;
    if (!item.hlsUrl) {
      item.url = "";
      item.status = "failed";
      item.error = "The original file was deleted and no HLS output exists.";
    }
  });
};

export const deleteMedia = (id: string) => {
  requireRecord(id);
  stopJob(id);
  fs.rmSync(movieFolder(id), { recursive: true, force: true });
  const records = readIndex().filter((record) => record.id !== id);
  writeIndex(records);
  return {};
};

export const clearMediaCache = () => {
  mediaCacheGeneration += 1;
  queuedIds.splice(0, queuedIds.length);
  for (const [id, active] of activeJobs) {
    nextJobVersion(id);
    active.child.kill("SIGKILL");
  }
  activeJobs.clear();
  runningJobs.clear();
  ensureMediaDirectory();
  let removedFiles = 0;
  let removedBytes = 0;
  for (const entry of fs.readdirSync(mediaDirectory, { withFileTypes: true })) {
    if (
      entry.name === settingsFilename ||
      entry.name === path.basename(indexFile)
    ) {
      continue;
    }
    const target = path.join(mediaDirectory, entry.name);
    const stats = fs.statSync(target);
    removedBytes += stats.isFile() ? stats.size : 0;
    fs.rmSync(target, { recursive: true, force: true });
    removedFiles += 1;
  }
  writeIndex([]);
  return { removedFiles, removedBytes };
};

export const getMediaDirectory = () => {
  ensureMediaDirectory();
  return mediaDirectory;
};
