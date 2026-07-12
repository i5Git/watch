import React, { FormEvent, useCallback, useContext, useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
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
  IconDatabaseX,
  IconDeviceFloppy,
  IconKey,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconTrash,
  IconUserOff,
  IconUserPlus,
} from "@tabler/icons-react";
import { MetadataContext, type ClientUser } from "../../MetadataContext";
import { TopBar } from "../TopBar/TopBar";
import styles from "./AdminPanel.module.css";

type ManagedUser = ClientUser & { disabled?: boolean };

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

  const loadUsers = useCallback(async () => {
    setError("");
    try {
      setUsers(await request("/api/admin/users"));
    } catch (loadError: any) {
      setError(loadError?.message || "کاربران بارگذاری نشدند.");
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

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
    } catch (cacheError: any) {
      setError(cacheError?.message || "پاک‌سازی کش رسانه انجام نشد.");
    } finally {
      setCacheLoading(false);
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
      await request(`/api/admin/users/${encodeURIComponent(managedUser.username)}`, {
        method: "PATCH",
        body: JSON.stringify({ disabled: !managedUser.disabled }),
      });
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
      await request(`/api/admin/users/${encodeURIComponent(managedUser.username)}`, {
        method: "DELETE",
      });
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
      await request(`/api/admin/users/${encodeURIComponent(resetUser.username)}`, {
        method: "PATCH",
        body: JSON.stringify({ password: resetPassword }),
      });
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
            <p>
              کاربران، برند، صفحه اصلی و فایل‌های رسانه‌ای را مدیریت کنید.
            </p>
          </div>
          <Button
            variant="subtle"
            leftSection={<IconRefresh size={17} />}
            onClick={loadUsers}
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
                      <Table.Td>{managedUser.role === "admin" ? "مدیر" : "کاربر"}</Table.Td>
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
                          ? new Date(managedUser.lastLoginAt).toLocaleString("fa-IR")
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
                              managedUser.disabled ? "فعال کردن" : "غیرفعال کردن"
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
