import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import config from "./config.ts";
import type { AppUser } from "./auth.ts";

export type MediaStatus = "uploading" | "converting" | "ready" | "error";

export interface MediaRecord {
  id: string;
  name: string;
  originalName: string;
  filename: string;
  url: string;
  status: MediaStatus;
  converted: boolean;
  owner: string;
  createdAt: string;
  size?: number;
  error?: string;
}

const resolveDataPath = (value: string) =>
  path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);

const mediaDirectory = resolveDataPath(
  String(config.MEDIA_DATA_DIR || "data/media"),
);
const indexFile = path.join(mediaDirectory, "index.json");
const maxUploadBytes = Number(config.UPLOAD_MAX_BYTES) || 20 * 1024 * 1024 * 1024;
const activeConversions = new Set<ChildProcess>();
let mediaCacheGeneration = 0;

const ensureMediaDirectory = () => {
  fs.mkdirSync(mediaDirectory, { recursive: true });
};

const readIndex = (): MediaRecord[] => {
  ensureMediaDirectory();
  try {
    const parsed = JSON.parse(fs.readFileSync(indexFile, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.warn("Unable to read media index:", error);
    }
    return [];
  }
};

const writeIndex = (records: MediaRecord[]) => {
  ensureMediaDirectory();
  const temporaryFile = `${indexFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(records, null, 2), "utf8");
  fs.renameSync(temporaryFile, indexFile);
};

const updateRecord = (updated: MediaRecord) => {
  const records = readIndex();
  const index = records.findIndex((record) => record.id === updated.id);
  if (index === -1) {
    records.push(updated);
  } else {
    records[index] = updated;
  }
  writeIndex(records);
};

const safeName = (value: string) => {
  const trimmed = value.trim().replace(/[^\p{L}\p{N}._ -]+/gu, "_");
  return trimmed.replace(/\s+/g, "-").slice(0, 120) || "video";
};

const mediaPath = (filename: string) => path.join(mediaDirectory, filename);

const mediaForUser = (record: MediaRecord, user: AppUser) =>
  user.role === "admin" || record.owner === user.username;

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
  convertToMp4: boolean,
) => {
  ensureMediaDirectory();
  const generation = mediaCacheGeneration;
  const originalName = safeName(String(originalNameInput || "video"));
  const id = crypto.randomUUID();
  const temporaryFilename = `${id}-${originalName}`;
  const temporaryPath = mediaPath(temporaryFilename);
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxUploadBytes) {
        callback(new Error("The uploaded file is larger than the configured limit."));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(request, limiter, fs.createWriteStream(temporaryPath));
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
  if (generation !== mediaCacheGeneration) {
    fs.rmSync(temporaryPath, { force: true });
    throw new Error("The media cache was cleared while this file was uploading.");
  }

  const timestamp = new Date().toISOString();
  const record: MediaRecord = {
    id,
    name: originalName,
    originalName,
    filename: temporaryFilename,
    url: `/media/${encodeURIComponent(temporaryFilename)}`,
    status: convertToMp4 ? "converting" : "ready",
    converted: false,
    owner: user.username,
    createdAt: timestamp,
    size: bytes,
  };
  updateRecord(record);
  if (convertToMp4) {
    void convertMedia(record, generation);
  }
  return record;
};

const convertMedia = async (record: MediaRecord, generation: number) => {
  const input = mediaPath(record.filename);
  const outputFilename = `${record.id}.mp4`;
  const output = mediaPath(outputFilename);
  await new Promise<void>((resolve) => {
    const process = spawn(
      String(config.FFMPEG_PATH || "ffmpeg"),
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        input,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        output,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    activeConversions.add(process);
    let errorOutput = "";
    process.stderr.on("data", (chunk) => {
      errorOutput += String(chunk);
    });
    process.on("error", (error) => {
      if (generation !== mediaCacheGeneration) {
        resolve();
        return;
      }
      record.status = "error";
      record.error = error.message;
      updateRecord(record);
      resolve();
    });
    process.on("close", (code) => {
      activeConversions.delete(process);
      if (generation !== mediaCacheGeneration) {
        resolve();
        return;
      }
      if (code === 0) {
        fs.rmSync(input, { force: true });
        record.filename = outputFilename;
        record.name = `${path.parse(record.originalName).name}.mp4`;
        record.url = `/media/${encodeURIComponent(outputFilename)}`;
        record.status = "ready";
        record.converted = true;
        record.error = undefined;
        updateRecord(record);
      } else {
        fs.rmSync(output, { force: true });
        record.status = "error";
        record.error =
          errorOutput.trim() || "The server could not convert this file.";
        updateRecord(record);
      }
      resolve();
    });
  });
};

export const clearMediaCache = () => {
  mediaCacheGeneration += 1;
  for (const process of activeConversions) {
    process.kill("SIGTERM");
  }
  activeConversions.clear();
  ensureMediaDirectory();
  let removedFiles = 0;
  let removedBytes = 0;
  for (const entry of fs.readdirSync(mediaDirectory, { withFileTypes: true })) {
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
