import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import config from "./config.ts";
import type { MediaSettings } from "./mediaSettings.ts";

export interface ProbedMedia {
  duration: number;
  resolution: string;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  bitrate: number;
  fileSize: number;
  hasAudio: boolean;
}

export interface TranscodeProgress {
  processedSeconds: number;
  percent: number;
  speed: number;
  etaSeconds: number | null;
}

export interface TranscodeJob {
  inputPath: string;
  outputDirectory: string;
  metadata: ProbedMedia;
  settings: MediaSettings;
  onProgress: (progress: TranscodeProgress) => void;
}

export interface TranscodeBackend {
  readonly id: string;
  start(job: TranscodeJob): ChildProcess;
}

const parseRate = (value: string | undefined) => {
  if (!value) {
    return 0;
  }
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator)) {
    return 0;
  }
  return denominator ? numerator / denominator : numerator;
};

const runJsonProcess = (executable: string, args: string[]) =>
  new Promise<any>((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let errorOutput = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      errorOutput += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(errorOutput.trim() || `${executable} failed.`));
        return;
      }
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Error(`Unable to parse ${executable} output.`));
      }
    });
  });

export const probeMedia = async (
  inputPath: string,
  knownFileSize?: number,
): Promise<ProbedMedia> => {
  const result = await runJsonProcess(
    String(config.FFPROBE_PATH || "ffprobe"),
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", inputPath],
  );
  const streams = Array.isArray(result.streams) ? result.streams : [];
  const video = streams.find((stream: any) => stream.codec_type === "video");
  const audio = streams.find((stream: any) => stream.codec_type === "audio");
  if (!video) {
    throw new Error("The uploaded file does not contain a video stream.");
  }
  const duration = Number(result.format?.duration || video.duration || 0);
  const fileSize =
    Number(result.format?.size || knownFileSize || 0) ||
    fs.statSync(inputPath).size;
  return {
    duration,
    resolution: `${Number(video.width || 0)}x${Number(video.height || 0)}`,
    width: Number(video.width || 0),
    height: Number(video.height || 0),
    fps: parseRate(video.avg_frame_rate || video.r_frame_rate),
    videoCodec: String(video.codec_name || "unknown"),
    audioCodec: String(audio?.codec_name || "none"),
    bitrate: Number(result.format?.bit_rate || video.bit_rate || 0),
    fileSize,
    hasAudio: Boolean(audio),
  };
};

const runThumbnail = (
  inputPath: string,
  outputPath: string,
  timestamp: number,
  onProcessStart?: (child: ChildProcess) => void,
  onProcessFinish?: (child: ChildProcess) => void,
) =>
  new Promise<void>((resolve) => {
    const child = spawn(
      String(config.FFMPEG_PATH || "ffmpeg"),
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(Math.max(0, timestamp)),
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-2",
        "-q:v",
        "3",
        outputPath,
      ],
      { stdio: "ignore" },
    );
    onProcessStart?.(child);
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      onProcessFinish?.(child);
      resolve();
    };
    child.on("error", finish);
    child.on("close", finish);
  });

export const generateThumbnails = async (
  inputPath: string,
  outputDirectory: string,
  duration: number,
  processObserver?: {
    onStart?: (child: ChildProcess) => void;
    onFinish?: (child: ChildProcess) => void;
  },
) => {
  const posterTime = Math.min(2, Math.max(0, duration * 0.05));
  const previewTime = Math.min(30, Math.max(0, duration * 0.2));
  await Promise.all([
    runThumbnail(
      inputPath,
      path.join(outputDirectory, "poster.jpg"),
      posterTime,
      processObserver?.onStart,
      processObserver?.onFinish,
    ),
    runThumbnail(
      inputPath,
      path.join(outputDirectory, "thumbnail.jpg"),
      previewTime,
      processObserver?.onStart,
      processObserver?.onFinish,
    ),
  ]);
};

class SoftwareHlsBackend implements TranscodeBackend {
  readonly id = "software-libx264";

  start(job: TranscodeJob) {
    const { settings, metadata } = job;
    const audioArgs = !metadata.hasAudio
      ? ["-an"]
      : settings.audioMode === "copy" ||
          (settings.audioMode === "auto" && metadata.audioCodec === "aac")
        ? ["-c:a", "copy"]
        : ["-c:a", "aac", "-b:a", "192k"];
    const playlistPath = path.join(job.outputDirectory, "master.m3u8");
    const segmentPattern = path.join(job.outputDirectory, "segment_%05d.ts");
    const child = spawn(
      String(config.FFMPEG_PATH || "ffmpeg"),
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        job.inputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        settings.preset,
        "-crf",
        String(settings.crf),
        "-pix_fmt",
        "yuv420p",
        ...audioArgs,
        "-force_key_frames",
        `expr:gte(t,n_forced*${settings.segmentLength})`,
        "-f",
        "hls",
        "-hls_time",
        String(settings.segmentLength),
        "-hls_list_size",
        "0",
        "-hls_playlist_type",
        "event",
        "-hls_flags",
        "independent_segments+temp_file",
        "-start_number",
        "0",
        "-hls_segment_filename",
        segmentPattern,
        "-progress",
        "pipe:2",
        "-nostats",
        playlistPath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    let progressBuffer = "";
    let processedSeconds = 0;
    let speed = 0;
    child.stderr.on("data", (chunk) => {
      progressBuffer += String(chunk);
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() || "";
      for (const line of lines) {
        const separator = line.indexOf("=");
        if (separator === -1) {
          continue;
        }
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1);
        if (key === "out_time_us") {
          processedSeconds = Number(value) / 1_000_000;
        } else if (key === "speed") {
          speed = Number(value.replace(/x$/i, "")) || 0;
        } else if (key === "progress") {
          const percent =
            metadata.duration > 0
              ? Math.min(100, (processedSeconds / metadata.duration) * 100)
              : 0;
          const remaining = Math.max(0, metadata.duration - processedSeconds);
          job.onProgress({
            processedSeconds,
            percent,
            speed,
            etaSeconds: speed > 0 ? remaining / speed : null,
          });
        }
      }
    });
    return child;
  }
}

const backends = new Map<string, TranscodeBackend>([
  ["software-libx264", new SoftwareHlsBackend()],
]);

export const getTranscodeBackend = (id = "software-libx264") => {
  const backend = backends.get(id);
  if (!backend) {
    throw new Error(`Unknown transcoding backend: ${id}`);
  }
  return backend;
};
