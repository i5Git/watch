import React, { useContext } from "react";
import { MetadataContext } from "../../MetadataContext";
import { t } from "../../i18n";
import styles from "./Footer.module.css";

export const Footer = () => {
  const { siteSettings } = useContext(MetadataContext);
  return (
    <footer className={styles.footer} dir="rtl">
      <nav aria-label="لینک‌های حقوقی">
        <a href="/faq">{t("faq")}</a>
        <a href="/privacy">{t("privacy")}</a>
        <a href="/terms">{t("terms")}</a>
      </nav>
      <p>{t("legalNotice")}</p>
      <span>© {siteSettings.brandName}</span>
    </footer>
  );
};
