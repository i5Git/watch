import React, { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  FileInput,
  Modal,
  Progress,
  Text,
} from "@mantine/core";
import {
  IconCircleCheck,
  IconDeviceMobile,
  IconUpload,
} from "@tabler/icons-react";

export interface UploadedMedia {
  id: string;
  name: string;
  url: string;
  status: "ready" | "converting" | "error";
}

export const FileShareModal = (props: {
  closeModal: () => void;
  uploadMedia: (
    file: File,
    convertToMp4: boolean,
    onProgress: (progress: number) => void,
  ) => Promise<UploadedMedia>;
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [convertToMp4, setConvertToMp4] = useState(true);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const upload = async () => {
    if (!file) {
      return;
    }
    setError("");
    setUploading(true);
    try {
      await props.uploadMedia(file, convertToMp4, setProgress);
      setProgress(100);
      window.setTimeout(props.closeModal, 450);
    } catch (uploadError: any) {
      setError(uploadError?.message || "آپلود انجام نشد.");
      setUploading(false);
    }
  };

  return (
    <Modal
      opened
      onClose={props.closeModal}
      title="آپلود ویدیو"
      centered
      size="md"
      dir="rtl"
    >
      <Text c="dimmed" size="sm" lh={1.8}>
        فایل روی VPS ذخیره می‌شود و بعد از آماده شدن، برای همه افراد اتاق پخش خواهد شد.
      </Text>
      <FileInput
        mt="lg"
        label="فایل ویدیو"
        placeholder="یک فایل انتخاب کنید"
        value={file}
        onChange={setFile}
        accept="video/*,.mkv,.avi,.mov,.webm,.m4v"
        clearable
        disabled={uploading}
      />
      <Checkbox
        mt="md"
        checked={convertToMp4}
        onChange={(event) => setConvertToMp4(event.currentTarget.checked)}
        disabled={uploading}
        label={
          <span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <IconDeviceMobile size={16} />
              تبدیل به MP4 برای آیفون
            </span>
          </span>
        }
        description="برای پخش پایدارتر در Safari، ویدیو به H.264 و AAC تبدیل می‌شود."
      />
      {uploading && (
        <div style={{ marginTop: 20 }}>
          <Progress value={progress} animated />
          <Text mt={6} size="xs" c="dimmed">
            {convertToMp4 ? "آپلود و تبدیل در حال انجام است…" : "آپلود در حال انجام است…"}
          </Text>
        </div>
      )}
      {error && (
        <Alert mt="md" color="red">
          {error}
        </Alert>
      )}
      {!uploading && progress === 100 && (
        <Alert mt="md" color="teal" icon={<IconCircleCheck size={18} />}>
          ویدیو آماده پخش است.
        </Alert>
      )}
      <Button
        mt="xl"
        fullWidth
        disabled={!file || uploading}
        loading={uploading}
        onClick={upload}
        leftSection={<IconUpload size={18} />}
      >
        آپلود و پخش در اتاق
      </Button>
    </Modal>
  );
};
