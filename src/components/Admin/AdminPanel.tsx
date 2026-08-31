import React, {
  FormEvent,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  ActionIcon,
  Alert,
  Button,
  NumberInput,
  Progress,
  Select,
  Group,
  Modal,
  PasswordInput,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconCheck,
  IconCopy,
  IconDatabaseX,
  IconDeviceFloppy,
  IconKey,
  IconMovie,
  IconPlayerStop,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconTrash,
  IconReload,
  IconUserOff,
  IconUserPlus,
} from "@tabler/icons-react";
import { MetadataContext, type ClientUser } from "../../MetadataContext";
import { TopBar } from "../TopBar/TopBar";
import styles from "./AdminPanel.module.css";

type ManagedUser = ClientUser & { disabled?: boolean };

type MediaStatus =
  "uploading" | "queued" | "converting" | "playable" | "ready" | "failed";

interface ManagedMedia {
  id: string;
  name: string;
  owner: string;
  status: MediaStatus;
  size?: number;
  originalUrl?: string;
  hlsUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  metadata?: {
    duration: number;
    resolution: string;
    fps: number;
    videoCodec: string;
    audioCodec: string;
    bitrate: number;
  };
  progress?: {
    percent: number;
    speed: number;
    etaSeconds: number | null;
  };
}

interface MediaSettings {
  preset: string;
  crf: number;
  segmentLength: number;
  audioMode: "auto" | "aac" | "copy";
  deleteOriginalAfterConversion: boolean;
  maxConcurrentConversions: number;
}

const defaultMediaSettings: MediaSettings = {
  preset: "veryfast",
  crf: 23,
  segmentLength: 6,
  audioMode: "auto",
  deleteOriginalAfterConversion: false,
  maxConcurrentConversions: 1,
};

const statusLabels: Record<MediaStatus, string> = {
  uploading: "در حال آپلود",
  queued: "در صف",
  converting: "در حال تبدیل",
  playable: "قابل پخش — در حال پردازش",
  ready: "آماده",
  failed: "ناموفق",
};

const formatBytes = (bytes = 0) => {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
};

const formatEta = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

const request = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "درخواست انجام نشد.");
  }
  return data;
};

const copyText = async (value: string) => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("Clipboard access is unavailable.");
  }
};

export const AdminPanel = () => {
  const { user, siteSettings, refreshSiteSettings } =
    useContext(MetadataContext);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [brandName, setBrandName] = useState(siteSettings.brandName);
  const [defaultRoomName, setDefaultRoomName] = useState(
    siteSettings.defaultRoomName,
  );
  const [landingEnabled, setLandingEnabled] = useState(
    siteSettings.landingEnabled,
  );
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [media, setMedia] = useState<ManagedMedia[]>([]);
  const [mediaSettings, setMediaSettings] =
    useState<MediaSettings>(defaultMediaSettings);
  const [mediaSettingsLoading, setMediaSettingsLoading] = useState(false);
  const [mediaActionId, setMediaActionId] = useState("");

  const loadUsers = useCallback(async () => {
    setError("");
    try {
      setUsers(await request("/api/admin/users"));
    } catch (loadError: any) {
      setError(loadError?.message || "کاربران بارگذاری نشدند.");
    }
  }, []);

  const loadMedia = useCallback(async () => {
    try {
      setMedia(await request("/api/media"));
    } catch (loadError: any) {
      setError(loadError?.message || "فهرست رسانه‌ها بارگذاری نشد.");
    }
  }, []);

  const loadMediaSettings = useCallback(async () => {
    try {
      setMediaSettings(await request("/api/admin/media-settings"));
    } catch (loadError: any) {
      setError(loadError?.message || "تنظیمات تبدیل بارگذاری نشد.");
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadUsers(), loadMedia(), loadMediaSettings()]);
    const interval = window.setInterval(() => {
      void loadMedia();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [loadMedia, loadMediaSettings, loadUsers]);

  useEffect(() => {
    setBrandName(siteSettings.brandName);
    setDefaultRoomName(siteSettings.defaultRoomName);
    setLandingEnabled(siteSettings.landingEnabled);
  }, [siteSettings]);

  const saveSiteSettings = async () => {
    setSettingsLoading(true);
    setNotice("");
    setError("");
    try {
      await request("/api/admin/site-settings", {
        method: "PATCH",
        body: JSON.stringify({ brandName, defaultRoomName, landingEnabled }),
      });
      await refreshSiteSettings();
      setNotice("تنظیمات سایت ذخیره شد.");
    } catch (settingsError: any) {
      setError(settingsError?.message || "تنظیمات سایت ذخیره نشد.");
    } finally {
      setSettingsLoading(false);
    }
  };

  const clearMedia = async () => {
    if (
      !window.confirm(
        "همه فایل‌های رسانه‌ای آپلودشده و تبدیل‌شده از سرور حذف شوند؟",
      )
    ) {
      return;
    }
    setCacheLoading(true);
    setNotice("");
    setError("");
    try {
      const result = await request("/api/admin/media-cache", {
        method: "DELETE",
      });
      setNotice(
        `کش رسانه پاک شد. ${Number(result.removedFiles || 0).toLocaleString("fa-IR")} مورد حذف شد.`,
      );
      await loadMedia();
    } catch (cacheError: any) {
      setError(cacheError?.message || "پاک‌سازی کش رسانه انجام نشد.");
    } finally {
      setCacheLoading(false);
    }
  };

  const saveMediaSettings = async () => {
    setMediaSettingsLoading(true);
    setNotice("");
    setError("");
    try {
      setMediaSettings(
        await request("/api/admin/media-settings", {
          method: "PATCH",
          body: JSON.stringify(mediaSettings),
        }),
      );
      setNotice("تنظیمات تبدیل رسانه ذخیره شد.");
    } catch (settingsError: any) {
      setError(settingsError?.message || "تنظیمات تبدیل ذخیره نشد.");
    } finally {
      setMediaSettingsLoading(false);
    }
  };

  const runMediaAction = async (
    item: ManagedMedia,
    action: "retry" | "cancel" | "rebuild" | "hls" | "original" | "delete",
  ) => {
    const destructive = ["hls", "original", "delete"].includes(action);
    if (
      destructive &&
      !window.confirm(`عملیات انتخاب‌شده روی «${item.name}» انجام شود؟`)
    ) {
      return;
    }
    setMediaActionId(`${item.id}:${action}`);
    setNotice("");
    setError("");
    try {
      const method = ["hls", "original", "delete"].includes(action)
        ? "DELETE"
        : "POST";
      const suffix = action === "delete" ? "" : `/${action}`;
      await request(
        `/api/admin/media/${encodeURIComponent(item.id)}${suffix}`,
        { method },
      );
      setNotice("عملیات رسانه انجام شد.");
      await loadMedia();
    } catch (actionError: any) {
      setError(actionError?.message || "عملیات رسانه انجام نشد.");
    } finally {
      setMediaActionId("");
    }
  };

  const copyPlaybackLink = async (item: ManagedMedia) => {
    const playbackPath = item.hlsUrl || item.originalUrl;
    if (!playbackPath) {
      setError("برای این رسانه هنوز لینک قابل پخشی وجود ندارد.");
      return;
    }
    setNotice("");
    setError("");
    try {
      const playbackUrl = new URL(playbackPath, window.location.origin).href;
      await copyText(playbackUrl);
      setNotice(`لینک پخش «${item.name}» کپی شد.`);
    } catch (copyError: any) {
      setError(copyError?.message || "کپی لینک پخش انجام نشد.");
    }
  };

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setNotice("");
    setError("");
    try {
      await request("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setUsername("");
      setPassword("");
      setNotice("کاربر با موفقیت ایجاد شد.");
      await loadUsers();
    } catch (createError: any) {
      setError(createError?.message || "ایجاد کاربر انجام نشد.");
    } finally {
      setLoading(false);
    }
  };

  const toggleUser = async (managedUser: ManagedUser) => {
    try {
      await request(
        `/api/admin/users/${encodeURIComponent(managedUser.username)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ disabled: !managedUser.disabled }),
        },
      );
      setNotice(managedUser.disabled ? "کاربر فعال شد." : "کاربر غیرفعال شد.");
      await loadUsers();
    } catch (toggleError: any) {
      setError(toggleError?.message || "وضعیت کاربر تغییر نکرد.");
    }
  };

  const removeUser = async (managedUser: ManagedUser) => {
    if (!window.confirm(`کاربر «${managedUser.username}» حذف شود؟`)) {
      return;
    }
    try {
      await request(
        `/api/admin/users/${encodeURIComponent(managedUser.username)}`,
        {
          method: "DELETE",
        },
      );
      setNotice("کاربر حذف شد.");
      await loadUsers();
    } catch (deleteError: any) {
      setError(deleteError?.message || "حذف کاربر انجام نشد.");
    }
  };

  const savePassword = async () => {
    if (!resetUser) {
      return;
    }
    try {
      await request(
        `/api/admin/users/${encodeURIComponent(resetUser.username)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ password: resetPassword }),
        },
      );
      setResetUser(null);
      setResetPassword("");
      setNotice("رمز عبور تغییر کرد.");
    } catch (resetError: any) {
      setError(resetError?.message || "تغییر رمز عبور انجام نشد.");
    }
  };

  if (user?.role !== "admin") {
    return (
      <>
        <TopBar />
        <main className={styles.denied} dir="rtl">
          <h1>دسترسی محدود است</h1>
          <p>این بخش فقط برای مدیر در دسترس است.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar />
      <main className={styles.page} dir="rtl">
        <div className={styles.heading}>
          <div>
            <h1>مدیریت سایت</h1>
            <p>کاربران، برند، صفحه اصلی و فایل‌های رسانه‌ای را مدیریت کنید.</p>
          </div>
          <Button
            variant="subtle"
            leftSection={<IconRefresh size={17} />}
            onClick={() =>
              void Promise.all([loadUsers(), loadMedia(), loadMediaSettings()])
            }
          >
            به‌روزرسانی
          </Button>
        </div>

        {notice && (
          <Alert
            color="teal"
            icon={<IconCheck size={18} />}
            onClose={() => setNotice("")}
            withCloseButton
          >
            {notice}
          </Alert>
        )}
        {error && (
          <Alert color="red" onClose={() => setError("")} withCloseButton>
            {error}
          </Alert>
        )}

        <div className={styles.settingsGrid}>
          <section className={styles.formPanel}>
            <div className={styles.panelTitle}>
              <IconSettings size={20} />
              <h2>تنظیمات سایت</h2>
            </div>
            <div className={styles.settingsForm}>
              <TextInput
                label="نام برند"
                description="در سربرگ، صفحه ورود و عنوان مرورگر نمایش داده می‌شود."
                value={brandName}
                maxLength={50}
                onChange={(event) => setBrandName(event.currentTarget.value)}
              />
              <TextInput
                label="نام پیش‌فرض اتاق"
                description="وقتی اتاق عنوان جداگانه‌ای ندارد، این نام نمایش داده می‌شود."
                value={defaultRoomName}
                maxLength={50}
                onChange={(event) =>
                  setDefaultRoomName(event.currentTarget.value)
                }
              />
              <Switch
                checked={landingEnabled}
                onChange={(event) =>
                  setLandingEnabled(event.currentTarget.checked)
                }
                label="نمایش صفحه اصلی کامل"
                description="در حالت خاموش فقط کادر ورود لینک اتاق نمایش داده می‌شود."
              />
              <Button
                className={styles.primaryButton}
                loading={settingsLoading}
                leftSection={<IconDeviceFloppy size={18} />}
                onClick={saveSiteSettings}
              >
                ذخیره تنظیمات
              </Button>
            </div>
          </section>

          <section className={`${styles.formPanel} ${styles.dangerPanel}`}>
            <div className={styles.panelTitle}>
              <IconDatabaseX size={20} />
              <h2>کش رسانه سرور</h2>
            </div>
            <div className={styles.settingsForm}>
              <p className={styles.warningCopy}>
                همه ویدیوهای آپلودشده، فایل‌های تبدیل‌شده و فهرست رسانه حذف
                می‌شوند. حساب‌های کاربران حذف نخواهند شد.
              </p>
              <Button
                color="red"
                variant="light"
                loading={cacheLoading}
                leftSection={<IconTrash size={18} />}
                onClick={clearMedia}
              >
                پاک‌کردن همه رسانه‌های ذخیره‌شده
              </Button>
            </div>
          </section>
        </div>

        <section className={`${styles.formPanel} ${styles.mediaSettingsPanel}`}>
          <div className={styles.panelTitle}>
            <IconSettings size={20} />
            <h2>تنظیمات تبدیل رسانه</h2>
          </div>
          <div className={styles.mediaSettingsForm}>
            <Select
              label="Preset انکودر"
              value={mediaSettings.preset}
              data={[
                "ultrafast",
                "superfast",
                "veryfast",
                "faster",
                "fast",
                "medium",
                "slow",
                "slower",
                "veryslow",
              ]}
              onChange={(value) =>
                value &&
                setMediaSettings((current) => ({
                  ...current,
                  preset: value,
                }))
              }
            />
            <NumberInput
              label="CRF"
              description="عدد کمتر یعنی کیفیت و حجم بیشتر."
              min={0}
              max={51}
              value={mediaSettings.crf}
              onChange={(value) =>
                setMediaSettings((current) => ({
                  ...current,
                  crf: Number(value) || 0,
                }))
              }
            />
            <NumberInput
              label="طول هر قطعه HLS"
              suffix=" ثانیه"
              min={2}
              max={30}
              value={mediaSettings.segmentLength}
              onChange={(value) =>
                setMediaSettings((current) => ({
                  ...current,
                  segmentLength: Number(value) || 6,
                }))
              }
            />
            <Select
              label="حالت صدا"
              value={mediaSettings.audioMode}
              data={[
                {
                  value: "auto",
                  label: "خودکار — کپی AAC، تبدیل سایر فرمت‌ها",
                },
                { value: "aac", label: "همیشه تبدیل به AAC 192k" },
                { value: "copy", label: "همیشه کپی بدون تبدیل" },
              ]}
              onChange={(value) =>
                value &&
                setMediaSettings((current) => ({
                  ...current,
                  audioMode: value as MediaSettings["audioMode"],
                }))
              }
            />
            <NumberInput
              label="حداکثر تبدیل هم‌زمان"
              min={1}
              max={8}
              value={mediaSettings.maxConcurrentConversions}
              onChange={(value) =>
                setMediaSettings((current) => ({
                  ...current,
                  maxConcurrentConversions: Number(value) || 1,
                }))
              }
            />
            <Switch
              checked={mediaSettings.deleteOriginalAfterConversion}
              onChange={(event) =>
                setMediaSettings((current) => ({
                  ...current,
                  deleteOriginalAfterConversion: event.currentTarget.checked,
                }))
              }
              label="حذف فایل اصلی پس از پایان موفق تبدیل"
              description="برای امکان بازسازی HLS بهتر است فایل اصلی نگه داشته شود."
            />
            <Button
              className={styles.primaryButton}
              loading={mediaSettingsLoading}
              leftSection={<IconDeviceFloppy size={18} />}
              onClick={saveMediaSettings}
            >
              ذخیره تنظیمات تبدیل
            </Button>
          </div>
        </section>

        <section className={`${styles.tablePanel} ${styles.mediaPanel}`}>
          <div className={styles.panelTitle}>
            <IconMovie size={20} />
            <h2>رسانه‌ها و صف تبدیل</h2>
            <span className={styles.count}>{media.length}</span>
          </div>
          <div className={styles.mediaCards}>
            {media.length === 0 ? (
              <p className={styles.emptyMedia}>هنوز رسانه‌ای آپلود نشده است.</p>
            ) : (
              media.map((item) => (
                <article className={styles.mediaCard} key={item.id}>
                  <div className={styles.mediaPoster}>
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt="" />
                    ) : (
                      <IconMovie size={30} />
                    )}
                  </div>
                  <div className={styles.mediaDetails}>
                    <div className={styles.mediaCardHeading}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>
                          {item.owner} · {formatBytes(item.size)}
                          {item.metadata?.resolution
                            ? ` · ${item.metadata.resolution}`
                            : ""}
                        </span>
                      </div>
                      <span
                        className={`${styles.mediaStatus} ${styles[`mediaStatus_${item.status}`] || ""}`}
                      >
                        {statusLabels[item.status]}
                      </span>
                    </div>
                    {(item.status === "queued" ||
                      item.status === "converting" ||
                      item.status === "playable") && (
                      <div className={styles.mediaProgress}>
                        <Progress
                          value={item.progress?.percent || 0}
                          animated={item.status !== "queued"}
                        />
                        <span>
                          {(item.progress?.percent || 0).toFixed(1)}٪ ·{" "}
                          {(item.progress?.speed || 0).toFixed(2)}x · باقی‌مانده{" "}
                          {formatEta(item.progress?.etaSeconds)}
                        </span>
                      </div>
                    )}
                    {item.metadata && (
                      <span className={styles.mediaMeta}>
                        {item.metadata.videoCodec} / {item.metadata.audioCodec}{" "}
                        · {item.metadata.fps.toFixed(2)} FPS
                      </span>
                    )}
                    {item.error && (
                      <span className={styles.mediaError}>{item.error}</span>
                    )}
                    <Group gap={7} className={styles.mediaActions}>
                      {(item.status === "failed" || item.status === "ready") &&
                        item.originalUrl && (
                          <Button
                            size="compact-xs"
                            variant="light"
                            leftSection={<IconReload size={15} />}
                            loading={mediaActionId === `${item.id}:retry`}
                            onClick={() => runMediaAction(item, "retry")}
                          >
                            تلاش مجدد
                          </Button>
                        )}
                      {(item.status === "queued" ||
                        item.status === "converting" ||
                        item.status === "playable") && (
                        <Button
                          size="compact-xs"
                          color="orange"
                          variant="light"
                          leftSection={<IconPlayerStop size={15} />}
                          loading={mediaActionId === `${item.id}:cancel`}
                          onClick={() => runMediaAction(item, "cancel")}
                        >
                          لغو
                        </Button>
                      )}
                      {item.originalUrl && (
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          loading={mediaActionId === `${item.id}:rebuild`}
                          onClick={() => runMediaAction(item, "rebuild")}
                        >
                          بازسازی HLS
                        </Button>
                      )}
                      {item.hlsUrl && (
                        <>
                          <Button
                            size="compact-xs"
                            color="teal"
                            variant="light"
                            leftSection={<IconCopy size={15} />}
                            onClick={() => void copyPlaybackLink(item)}
                          >
                            کپی لینک پخش
                          </Button>
                          <Button
                            size="compact-xs"
                            color="orange"
                            variant="subtle"
                            loading={mediaActionId === `${item.id}:hls`}
                            onClick={() => runMediaAction(item, "hls")}
                          >
                            حذف HLS
                          </Button>
                        </>
                      )}
                      {item.originalUrl && (
                        <Button
                          size="compact-xs"
                          color="orange"
                          variant="subtle"
                          loading={mediaActionId === `${item.id}:original`}
                          onClick={() => runMediaAction(item, "original")}
                        >
                          حذف فایل اصلی
                        </Button>
                      )}
                      <ActionIcon
                        color="red"
                        variant="subtle"
                        aria-label="حذف کامل رسانه"
                        loading={mediaActionId === `${item.id}:delete`}
                        onClick={() => runMediaAction(item, "delete")}
                      >
                        <IconTrash size={17} />
                      </ActionIcon>
                    </Group>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <div className={styles.layout}>
          <section className={styles.formPanel}>
            <div className={styles.panelTitle}>
              <IconUserPlus size={20} />
              <h2>افزودن کاربر</h2>
            </div>
            <form className={styles.form} onSubmit={createUser}>
              <TextInput
                required
                label="نام کاربری"
                placeholder="مثلاً sara"
                value={username}
                onChange={(event) => setUsername(event.currentTarget.value)}
              />
              <PasswordInput
                required
                label="رمز عبور"
                placeholder="حداقل ۸ نویسه"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
              <Button
                type="submit"
                loading={loading}
                className={styles.primaryButton}
                leftSection={<IconPlus size={18} />}
              >
                ایجاد کاربر
              </Button>
            </form>
          </section>

          <section className={styles.tablePanel}>
            <div className={styles.panelTitle}>
              <IconKey size={20} />
              <h2>کاربران</h2>
              <span className={styles.count}>{users.length}</span>
            </div>
            <div className={styles.tableWrap}>
              <Table highlightOnHover verticalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>نام کاربری</Table.Th>
                    <Table.Th>نقش</Table.Th>
                    <Table.Th>وضعیت</Table.Th>
                    <Table.Th>آخرین فعالیت</Table.Th>
                    <Table.Th>عملیات</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {users.map((managedUser) => (
                    <Table.Tr key={managedUser.username}>
                      <Table.Td>
                        <Text fw={700}>{managedUser.username}</Text>
                      </Table.Td>
                      <Table.Td>
                        {managedUser.role === "admin" ? "مدیر" : "کاربر"}
                      </Table.Td>
                      <Table.Td>
                        <span
                          className={`${styles.status} ${
                            managedUser.disabled ? styles.disabled : ""
                          }`}
                        >
                          {managedUser.disabled ? "غیرفعال" : "فعال"}
                        </span>
                      </Table.Td>
                      <Table.Td c="dimmed">
                        {managedUser.lastLoginAt
                          ? new Date(managedUser.lastLoginAt).toLocaleString(
                              "fa-IR",
                            )
                          : "هنوز وارد نشده"}
                      </Table.Td>
                      <Table.Td>
                        <Group gap={5} wrap="nowrap">
                          <ActionIcon
                            variant="subtle"
                            color="teal"
                            aria-label="تغییر رمز"
                            onClick={() => setResetUser(managedUser)}
                          >
                            <IconKey size={17} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color={managedUser.disabled ? "teal" : "orange"}
                            aria-label={
                              managedUser.disabled
                                ? "فعال کردن"
                                : "غیرفعال کردن"
                            }
                            disabled={managedUser.username === user.username}
                            onClick={() => toggleUser(managedUser)}
                          >
                            <IconUserOff size={17} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            aria-label="حذف کاربر"
                            disabled={managedUser.username === user.username}
                            onClick={() => removeUser(managedUser)}
                          >
                            <IconTrash size={17} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          </section>
        </div>
      </main>

      <Modal
        opened={Boolean(resetUser)}
        onClose={() => {
          setResetUser(null);
          setResetPassword("");
        }}
        title={`تغییر رمز ${resetUser?.username || ""}`}
        centered
        dir="rtl"
      >
        <PasswordInput
          autoFocus
          label="رمز عبور جدید"
          placeholder="حداقل ۸ نویسه"
          value={resetPassword}
          onChange={(event) => setResetPassword(event.currentTarget.value)}
        />
        <Button
          fullWidth
          mt="lg"
          className={styles.primaryButton}
          onClick={savePassword}
          disabled={!resetPassword}
        >
          ذخیره رمز
        </Button>
      </Modal>
    </>
  );
};
