import React, { useContext } from "react";
import { MetadataContext } from "../../MetadataContext";

const pageStyle: React.CSSProperties = {
  width: "min(900px, calc(100% - 32px))",
  margin: "0 auto",
  padding: "54px 0 90px",
  lineHeight: 1.9,
};

const Page = ({ children }: { children: React.ReactNode }) => (
  <article dir="rtl" style={pageStyle}>
    {children}
  </article>
);

export const Privacy = () => {
  const { siteSettings } = useContext(MetadataContext);
  return <Page>
    <h1>حریم خصوصی</h1>
    <h2>اتاق‌ها</h2>
    <ul>
      <li>اتاق‌های بدون فعالیت پس از مدتی آزاد می‌شوند.</li>
      <li>
        محتوای ویدیو برای گزارش‌های تحلیلی {siteSettings.brandName} ذخیره
        نمی‌شود.
      </li>
      <li>پیام‌های اتاق فقط برای همگام‌سازی همان اتاق نگهداری می‌شوند.</li>
    </ul>
    <h2>حساب‌های دسترسی</h2>
    <ul>
      <li>
        دسترسی به {siteSettings.brandName} توسط مدیر سایت ساخته و مدیریت می‌شود.
      </li>
      <li>رمز عبور کاربران به‌صورت هش‌شده در VPS نگهداری می‌شود.</li>
      <li>اطلاعات دسترسی یا پیام‌های شما به اشخاص ثالث فروخته نمی‌شود.</li>
    </ul>
    <h2>فایل‌های آپلودشده</h2>
    <p>
      فایل‌هایی که در اتاق آپلود می‌کنید روی فضای ذخیره‌سازی VPS شما قرار می‌گیرند.
      قبل از اشتراک‌گذاری، مطمئن شوید اجازه استفاده و پخش آن‌ها را دارید.
    </p>
  </Page>;
};

export const Terms = () => {
  const { siteSettings } = useContext(MetadataContext);
  return <Page>
    <h1>قوانین استفاده</h1>
    <p>با استفاده از {siteSettings.brandName} با موارد زیر موافقت می‌کنید:</p>
    <ul>
      <li>فقط محتوایی را پخش کنید که اجازه استفاده از آن را دارید.</li>
      <li>از سرویس برای محتوای غیرقانونی یا ناقض حقوق دیگران استفاده نکنید.</li>
      <li>امنیت نام کاربری و رمز عبور خود را حفظ کنید.</li>
      <li>
        {siteSettings.brandName} دسترسی دائمی یا بدون خطا را تضمین نمی‌کند.
      </li>
    </ul>
  </Page>;
};

export const FAQ = () => (
  <Page>
    <h1>سؤالات متداول</h1>
    <h2>چطور با هم تماشا کنیم؟</h2>
    <p>
      یک اتاق بسازید، لینک MP4 یا HLS را وارد کنید یا ویدیو را روی VPS آپلود
      کنید، سپس لینک اتاق را برای همراهتان بفرستید.
    </p>
    <h2>چرا تبدیل MP4 برای آیفون پیشنهاد می‌شود؟</h2>
    <p>
      Safari روی iPhone با MP4 شامل H.264 و AAC سازگاری قابل‌اعتمادتری دارد.
      گزینه تبدیل، فایل‌هایی مثل MKV را روی VPS به این فرمت تبدیل می‌کند.
    </p>
    <h2>چطور کاربر جدید بسازم؟</h2>
    <p>
      با حساب مدیر وارد شوید و از منوی حساب، صفحه مدیریت کاربران را باز کنید.
      ثبت‌نام عمومی در این نسخه وجود ندارد.
    </p>
  </Page>
);
