import React, { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  FileInput,
  Modal,
  Progress,
  Select,
  Text,
} from "@mantine/core";
import {
  IconBolt,
  IconCircleCheck,
  IconClockHour4,
  IconUpload,
} from "@tabler/icons-react";

export interface UploadOptions {
  preset: string;
  playWhen: "playable" | "ready";
}

export interface UploadedMedia {
  id: string;
  name: string;
  url: string;
  status:
    "uploading" | "queued" | "converting" | "playable" | "ready" | "failed";
  error?: string;
  progress?: {
    percent: number;
    speed: number;
    etaSeconds: number | null;
  };
}

const statusText: Record<UploadedMedia["status"], string> = {
  uploading: "در حال آپلود",
  queued: "در صف تبدیل",
  converting: "در حال تبدیل",
  playable: "قابل پخش؛ تبدیل ادامه دارد",
  ready: "آماده پخش",
  failed: "تبدیل ناموفق",
};

const formatEta = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) {
    return "در حال محاسبه";
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
};

export const FileShareModal = (props: {
  closeModal: () => void;
  uploadMedia: (
    file: File,
    options: UploadOptions,
    onUploadProgress: (progress: number) => void,
    onMediaStatus: (media: UploadedMedia) => void,
  ) => Promise<UploadedMedia>;
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState("veryfast");
  const [playInstantly, setPlayInstantly] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [mediaStatus, setMediaStatus] = useState<UploadedMedia | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "converting">(
    "idle",
  );
  const [error, setError] = useState("");

  const busy = phase !== "idle";

  const upload = async () => {
    if (!file) {
      return;
    }
    setError("");
    setMediaStatus(null);
    setPhase("uploading");
    try {
      const result = await props.uploadMedia(
        file,
        {
          preset,
          playWhen: playInstantly ? "playable" : "ready",
        },
        setUploadProgress,
        (status) => {
          setMediaStatus(status);
          if (!playInstantly && status.status !== "ready") {
            setPhase("converting");
          }
        },
      );
      setMediaStatus(result);
      setUploadProgress(100);
      window.setTimeout(props.closeModal, playInstantly ? 400 : 900);
    } catch (uploadError: any) {
      setError(uploadError?.message || "آپلود یا تبدیل انجام نشد.");
      setPhase("idle");
    }
  };

  const conversionPercent = mediaStatus?.progress?.percent || 0;

  return (
    <Modal
      opened
      onClose={busy ? () => undefined : props.closeModal}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      title="آپلود ویدیو"
      centered
      size="md"
      dir="rtl"
    >
      <Text c="dimmed" size="sm" lh={1.8}>
        فایل اصلی روی VPS ذخیره می‌شود و نسخه HLS سازگار با آیفون در پس‌زمینه
        ساخته خواهد شد.
      </Text>

      <FileInput
        mt="lg"
        label="فایل ویدیو"
        placeholder="یک فایل انتخاب کنید"
        value={file}
        onChange={setFile}
        accept="video/*,.mkv,.avi,.mov,.webm,.m4v"
        clearable
        disabled={busy}
      />

      <Select
        mt="md"
        label="سرعت تبدیل"
        description="Preset سریع‌تر زودتر قابل پخش می‌شود، اما فایل خروجی ممکن است بزرگ‌تر باشد."
        value={preset}
        disabled={busy}
        data={[
          { value: "ultrafast", label: "Ultra fast — سریع‌ترین" },
          { value: "superfast", label: "Super fast" },
          { value: "veryfast", label: "Very fast — پیشنهادی" },
          { value: "faster", label: "Faster" },
          { value: "fast", label: "Fast" },
          { value: "medium", label: "Medium — فشرده‌تر" },
        ]}
        onChange={(value) => value && setPreset(value)}
      />

      <Checkbox
        mt="lg"
        checked={playInstantly}
        disabled={busy}
        onChange={(event) => setPlayInstantly(event.currentTarget.checked)}
        label={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
          >
            <IconBolt size={17} />
            پخش به‌محض آماده شدن بخش ابتدایی
          </span>
        }
        description="اگر خاموش باشد، این پنجره پیشرفت تبدیل را نشان می‌دهد و پخش پس از تکمیل کامل آغاز می‌شود."
      />

      {phase === "uploading" && (
        <div style={{ marginTop: 20 }}>
          <Progress value={uploadProgress} animated />
          <Text mt={7} size="xs" c="dimmed">
            آپلود فایل — {uploadProgress.toLocaleString("fa-IR")}٪
          </Text>
        </div>
      )}

      {!playInstantly && phase === "converting" && mediaStatus && (
        <div style={{ marginTop: 20 }}>
          <Progress value={conversionPercent} animated />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 8,
            }}
          >
            <Text size="xs" c="dimmed">
              {statusText[mediaStatus.status]} —{" "}
              {conversionPercent.toLocaleString("fa-IR", {
                maximumFractionDigits: 1,
              })}
              ٪
            </Text>
            <Text
              size="xs"
              c="dimmed"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <IconClockHour4 size={14} />
              {formatEta(mediaStatus.progress?.etaSeconds)}
              {mediaStatus.progress?.speed
                ? ` · ${mediaStatus.progress.speed.toFixed(2)}x`
                : ""}
            </Text>
          </div>
        </div>
      )}

      {error && (
        <Alert mt="md" color="red">
          {error}
        </Alert>
      )}

      {mediaStatus?.status === "ready" && (
        <Alert mt="md" color="teal" icon={<IconCircleCheck size={18} />}>
          تبدیل کامل شد و ویدیو آماده پخش است.
        </Alert>
      )}

      <Button
        mt="xl"
        fullWidth
        disabled={!file || busy}
        loading={busy}
        onClick={upload}
        leftSection={<IconUpload size={18} />}
      >
        {playInstantly ? "آپلود و پخش سریع" : "آپلود و انتظار تا پایان تبدیل"}
      </Button>
    </Modal>
  );
};
