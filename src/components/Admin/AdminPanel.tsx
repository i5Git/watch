import React, { FormEvent, useCallback, useContext, useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  PasswordInput,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconCheck,
  IconKey,
  IconPlus,
  IconRefresh,
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
  const { user } = useContext(MetadataContext);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");

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
            <h1>مدیریت کاربران</h1>
            <p>کاربرانی را که می‌توانند وارد فضای خصوصی Watch شوند مدیریت کنید.</p>
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
