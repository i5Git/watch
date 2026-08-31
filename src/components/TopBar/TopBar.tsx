import React, { useCallback, useContext } from "react";
import { Button, Menu } from "@mantine/core";
import {
  IconCirclePlusFilled,
  IconLogout,
  IconPlayerPlayFilled,
  IconShieldLock,
  IconUser,
} from "@tabler/icons-react";
import { InviteButton } from "../InviteButton/InviteButton";
import { MetadataContext } from "../../MetadataContext";
import { t } from "../../i18n";
import styles from "./TopBar.module.css";

export async function createRoom(
  openNewTab: boolean | undefined,
  video: string = "",
) {
  const response = await fetch("/createRoom", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ video }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.name) {
    throw new Error(data?.error || "ساخت اتاق انجام نشد.");
  }
  if (openNewTab) {
    window.open("/watch" + data.name, "_blank", "noopener,noreferrer");
  } else {
    window.location.assign("/watch" + data.name);
  }
}

export const NewRoomButton = (props: {
  size?: string;
  openNewTab?: boolean;
}) => {
  const onClick = useCallback(async () => {
    await createRoom(props.openNewTab);
  }, [props.openNewTab]);

  return (
    <Button
      className={styles.primaryButton}
      size={props.size as any}
      onClick={onClick}
      leftSection={<IconCirclePlusFilled size={18} />}
    >
      {t("newRoom")}
    </Button>
  );
};

export const AccountMenu = () => {
  const { user } = useContext(MetadataContext);
  if (!user) {
    return null;
  }

  const signOut = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    window.location.assign("/");
  };

  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <button className={styles.accountButton} type="button">
          <IconUser size={18} />
          <span>{user.username}</span>
        </button>
      </Menu.Target>
      <Menu.Dropdown dir="rtl">
        <Menu.Label>{user.role === "admin" ? "مدیر" : "کاربر"}</Menu.Label>
        {user.role === "admin" && (
          <Menu.Item
            component="a"
            href="/admin"
            leftSection={<IconShieldLock size={16} />}
          >
            مدیریت سایت
          </Menu.Item>
        )}
        <Menu.Item leftSection={<IconLogout size={16} />} onClick={signOut}>
          خروج
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};

// Kept as a compatibility export for older integrations. The product no
// longer renders a public sign-in button.
export const SignInButton = AccountMenu;

export const TopBar = (props: {
  hideNewRoom?: boolean;
  hideSignin?: boolean;
  roomCode?: string;
  roomTitle?: string;
  roomDescription?: string;
  roomTitleColor?: string;
}) => {
  const { siteSettings } = useContext(MetadataContext);
  const compactRoomCode = /^[a-z]{4}$/i.test(props.roomCode || "")
    ? props.roomCode?.toUpperCase()
    : undefined;
  const isRoom = Boolean(
    compactRoomCode || props.roomTitle || props.roomDescription,
  );

  return (
    <header className={styles.topBar} dir="rtl">
      <div className={styles.brandCluster}>
        <a
          href="/"
          className={styles.brand}
          aria-label={siteSettings.brandName}
        >
          <span className={styles.brandMark}>
            <IconPlayerPlayFilled size={16} />
          </span>
          <span>{siteSettings.brandName}</span>
        </a>
        {isRoom ? (
          <div className={styles.roomIdentity}>
            <strong style={{ color: props.roomTitleColor || undefined }}>
              {props.roomTitle || t("room")}
            </strong>
            <div className={styles.roomMeta}>
              {compactRoomCode && (
                <span className={styles.roomCode} dir="ltr">
                  {compactRoomCode}
                </span>
              )}
              {props.roomDescription && <span>{props.roomDescription}</span>}
            </div>
          </div>
        ) : (
          <nav className={styles.homeNav} aria-label="ناوبری اصلی">
            <a href="/faq">{t("faq")}</a>
            <a href="/privacy">{t("privacy")}</a>
            <a href="/terms">{t("terms")}</a>
          </nav>
        )}
      </div>

      <div className={styles.topActions}>
        {isRoom && (
          <div className={styles.roomStatus}>
            <span className={styles.statusDot} />
            <span>{t("synced")}</span>
          </div>
        )}
        {!props.hideNewRoom && <NewRoomButton openNewTab />}
        {!props.hideSignin && <AccountMenu />}
        {isRoom && <InviteButton />}
      </div>
    </header>
  );
};
