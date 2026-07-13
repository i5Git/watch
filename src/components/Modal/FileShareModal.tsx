import React, { useState } from "react";
import { Alert, Button, FileInput, Modal, Progress, Text } from "@mantine/core";
import { IconCircleCheck, IconUpload } from "@tabler/icons-react";

export interface UploadedMedia {
  id: string;
  name: string;
  url: string;
  status:
    "uploading" | "queued" | "converting" | "playable" | "ready" | "failed";
  error?: string;
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
      await props.uploadMedia(file, true, setProgress);
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
        فایل روی VPS ذخیره می‌شود و بعد از آماده شدن، برای همه افراد اتاق پخش
        خواهد شد.
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
      <Alert mt="md" color="blue" variant="light">
        پس از پایان آپلود، تبدیل HLS در پس‌زمینه شروع می‌شود. به‌محض آماده شدن
        بخش ابتدایی فیلم، پخش در اتاق به‌صورت خودکار آغاز خواهد شد.
      </Alert>
      {uploading && (
        <div style={{ marginTop: 20 }}>
          <Progress value={progress} animated />
          <Text mt={6} size="xs" c="dimmed">
            فایل در حال آپلود است…
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
          آپلود تمام شد؛ تبدیل در پس‌زمینه ادامه دارد.
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
