import React, { FormEvent, useContext, useState } from "react";
import { Alert, Button, PasswordInput, TextInput } from "@mantine/core";
import { IconArrowLeft, IconLock, IconPlayerPlayFilled } from "@tabler/icons-react";
import { MetadataContext, type ClientUser } from "../../MetadataContext";
import styles from "./AccessGate.module.css";

interface AccessGateProps {
  onAuthenticated: (user: ClientUser) => void;
}

export const AccessGate = ({ onAuthenticated }: AccessGateProps) => {
  const { siteSettings } = useContext(MetadataContext);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "دسترسی انجام نشد.");
      }
      onAuthenticated(data);
    } catch (loginError: any) {
      setError(loginError?.message || "دسترسی انجام نشد.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.glow} aria-hidden="true" />
      <section className={styles.panel} aria-labelledby="access-title">
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <IconPlayerPlayFilled size={17} />
          </span>
          <span>{siteSettings.brandName}</span>
        </div>
        <div className={styles.heading}>
          <div className={styles.icon}>
            <IconLock size={20} />
          </div>
          <div>
            <h1 id="access-title">دسترسی به {siteSettings.brandName}</h1>
            <p>برای ادامه، نام کاربری و رمز عبوری را که مدیر ساخته وارد کنید.</p>
          </div>
        </div>
        <form className={styles.form} onSubmit={submit}>
          <TextInput
            required
            autoFocus
            label="نام کاربری"
            placeholder="نام کاربری خود را وارد کنید"
            value={username}
            onChange={(event) => setUsername(event.currentTarget.value)}
            autoComplete="username"
          />
          <PasswordInput
            required
            label="رمز عبور"
            placeholder="رمز عبور خود را وارد کنید"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            autoComplete="current-password"
          />
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <Button
            type="submit"
            loading={loading}
            fullWidth
            className={styles.submit}
            rightSection={<IconArrowLeft size={18} />}
          >
            ادامه
          </Button>
        </form>
        <p className={styles.footerNote}>این فضا خصوصی است و ثبت‌نام عمومی ندارد.</p>
      </section>
    </main>
  );
};
