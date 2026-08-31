import React, { FormEvent, useContext, useState } from "react";
import { Button, TextInput } from "@mantine/core";
import {
  IconArrowLeft,
  IconBadgeCc,
  IconLink,
  IconMessageFilled,
  IconPlayerPlayFilled,
  IconRefresh,
} from "@tabler/icons-react";
import { createRoom } from "../TopBar/TopBar";
import { t } from "../../i18n";
import styles from "./Home.module.css";
import { MetadataContext } from "../../MetadataContext";

const features = [
  {
    icon: IconRefresh,
    title: t("featureSync"),
    text: t("featureSyncText"),
    color: "teal",
  },
  {
    icon: IconMessageFilled,
    title: t("featureChat"),
    text: t("featureChatText"),
    color: "coral",
  },
  {
    icon: IconBadgeCc,
    title: t("featureSubtitles"),
    text: t("featureSubtitlesText"),
    color: "amber",
  },
];

const steps = [
  {
    number: "۱",
    title: t("stepRoom"),
    text: t("stepRoomText"),
    icon: "＋",
  },
  {
    number: "۲",
    title: t("stepShare"),
    text: t("stepShareText"),
    icon: "↗",
  },
  {
    number: "۳",
    title: t("stepPlay"),
    text: t("stepPlayText"),
    icon: "▶",
  },
];

export const Home = () => {
  const { siteSettings } = useContext(MetadataContext);
  const [source, setSource] = useState("");
  const [roomUrl, setRoomUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setIsCreating(true);
    try {
      await createRoom(false, source.trim());
    } catch (createError) {
      console.error(createError);
      setError("ساخت اتاق انجام نشد. دوباره تلاش کنید.");
      setIsCreating(false);
    }
  };

  const openRoom = (rawValue: string) => {
    const value = rawValue.trim();
    if (!value) {
      return;
    }
    if (/^[a-z]{4}$/i.test(value)) {
      window.location.assign(`/watch/${value.toUpperCase()}`);
      return;
    }
    try {
      const url = new URL(value, window.location.origin);
      const directCode = url.pathname.match(/^\/([a-z]{4})\/?$/i);
      if (directCode) {
        window.location.assign(`/watch/${directCode[1].toUpperCase()}`);
        return;
      }
      if (
        !url.pathname.startsWith("/watch/") &&
        !url.pathname.startsWith("/r/")
      ) {
        setError("کد چهارحرفی یا لینک معتبر اتاق را وارد کنید.");
        return;
      }
      const watchCode = url.pathname.match(/^\/watch\/([a-z]{4})\/?$/i);
      if (watchCode) {
        window.location.assign(
          `/watch/${watchCode[1].toUpperCase()}${url.search}`,
        );
        return;
      }
      window.location.assign(url.pathname + url.search);
    } catch {
      setError("کد یا لینک اتاق معتبر نیست.");
    }
  };

  const joinRoom = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    openRoom(roomUrl);
  };

  if (!siteSettings.landingEnabled) {
    return (
      <main className={styles.simpleJoinPage} dir="rtl">
        <form className={styles.simpleJoinCard} onSubmit={joinRoom}>
          <span className={styles.heroPlayMark}>
            <IconPlayerPlayFilled size={20} />
          </span>
          <h1>{siteSettings.brandName}</h1>
          <p>کد چهارحرفی یا لینک اتاق را وارد کنید.</p>
          <TextInput
            required
            value={roomUrl}
            onChange={(event) => setRoomUrl(event.currentTarget.value)}
            placeholder="ABCD یا لینک اتاق"
            leftSection={<IconLink size={18} />}
            dir="ltr"
          />
          <Button type="submit" leftSection={<IconArrowLeft size={18} />}>
            ورود به اتاق
          </Button>
          {error && <div className={styles.error}>{error}</div>}
        </form>
      </main>
    );
  }

  return (
    <main className={styles.homePage} dir="rtl">
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.heroTitleRow}>
            <span className={styles.heroPlayMark}>
              <IconPlayerPlayFilled size={18} />
            </span>
            <span className={styles.heroKicker}>تماشای خصوصی، با هم</span>
          </div>
          <h1>{t("homeHeadline")}</h1>
          <p>{t("homeSubhead")}</p>
          <form className={styles.createForm} onSubmit={submitCreate}>
            <TextInput
              aria-label={t("source")}
              className={styles.sourceInput}
              value={source}
              onChange={(event) => setSource(event.currentTarget.value)}
              placeholder={t("sourcePlaceholder")}
              leftSection={<IconLink size={18} />}
              dir="ltr"
            />
            <span className={styles.formHelper}>{t("homeHelper")}</span>
            <div className={styles.heroActions}>
              <Button
                type="submit"
                loading={isCreating}
                className={styles.primaryAction}
                leftSection={<IconPlayerPlayFilled size={18} />}
              >
                {t("createRoom")}
              </Button>
            </div>
            {error && <div className={styles.error}>{error}</div>}
          </form>
          <form className={styles.joinForm} onSubmit={joinRoom}>
            <TextInput
              aria-label="کد یا لینک اتاق"
              value={roomUrl}
              onChange={(event) => setRoomUrl(event.currentTarget.value)}
              placeholder="کد چهارحرفی مثل ABCD یا لینک اتاق"
              leftSection={<IconLink size={18} />}
              dir="ltr"
            />
            <Button
              type="submit"
              variant="outline"
              className={styles.secondaryAction}
              rightSection={<IconArrowLeft size={18} />}
            >
              {t("joinRoom")}
            </Button>
          </form>
        </div>
        <div className={styles.heroPreview}>
          <div className={styles.previewFrame}>
            <img
              src="/watch-room-preview.png"
              alt={`پیش‌نمایش اتاق تماشای ${siteSettings.brandName}`}
            />
          </div>
        </div>
      </section>

      <section className={styles.featureBand} aria-label="امکانات">
        {features.map(({ icon: FeatureIcon, title, text, color }) => (
          <div className={styles.feature} key={title}>
            <span className={`${styles.featureIcon} ${styles[color]}`}>
              <FeatureIcon size={22} />
            </span>
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </div>
        ))}
      </section>

      <section className={styles.stepsSection}>
        <h2>{t("howItWorks")}</h2>
        <div className={styles.steps}>
          {steps.map((step) => (
            <article className={styles.step} key={step.number}>
              <div className={styles.stepTop}>
                <span className={styles.stepNumber}>{step.number}</span>
                <span className={styles.stepIcon}>{step.icon}</span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
};
