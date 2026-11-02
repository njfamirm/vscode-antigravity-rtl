# vscode-antigravity-rtl

RTL (Persian / Arabic / Hebrew) support for the chat panel of the **Google Antigravity** extension in VS Code.

<div dir="rtl">

## مشکل

اکستنشن Antigravity توی VS Code از متن راست‌به‌چپ پشتیبانی نمی‌کنه. متن فارسی چپ‌چین نمایش داده میشه و وقتی با انگلیسی قاطی میشه به‌هم می‌ریزه.

## چرا راه‌حل‌های معمول جواب نمی‌دن

راه‌حل‌های معمول (Custom CSS، تغییر `workbench.html` و غیره) اینجا کار نمی‌کنن، چون:

1. پنل چت یک `webview` هست که فقط یک `iframe` داخلش داره.
2. اون `iframe` از یک سرور محلی لود میشه: `http://127.0.0.1:<port>`. این سرور رو برنامهٔ `~/.gemini/bin/agy` اجرا می‌کنه.
3. HTML و JS رابط کاربری **داخل خود فایل اجرایی `agy`** ساخته شده (embed شده). پس فایلی وجود نداره که بشه ویرایشش کرد.
4. `iframe` از یک origin دیگه لود میشه (cross-origin). پس از سمت `webview` هم نمیشه به DOM اون دست زد و CSS بهش اضافه کرد.

## راه‌حل: یک پراکسی محلی

بین VS Code و `agy` یک HTTP proxy کوچیک قرار می‌گیره:

```
webview  →  iframe  →  rtl-proxy (127.0.0.1:<port>)  →  agy hub
                         ↑ به پاسخ‌های HTML، CSS و JS مربوط به RTL اضافه می‌کنه
```

- **`rtl-proxy.js`** همهٔ درخواست‌ها رو به `agy` می‌فرسته و جواب رو برمی‌گردونه. فقط توی جواب‌های `text/html`، یک `<style>` و یک `<script>` قبل از `</head>` اضافه می‌کنه.
  - هدرهای `Host`، `Origin` و `Referer` رو بازنویسی می‌کنه تا `agy` فکر کنه درخواست مستقیم به خودش رسیده.
  - اتصال‌های WebSocket رو هم با `upgrade` پاس میده (چت از WebSocket استفاده می‌کنه).
  - پورتش از روی PID پروسه ثابت حساب میشه، که از همون اولین باری که پنل باز میشه آماده باشه.
- **CSS:** `unicode-bidi: plaintext` و `text-align: start` روی پاراگراف‌ها، لیست‌ها، تیترها، `textarea` و `contenteditable`. این‌طوری جهت هر پاراگراف از اولین حرفش تشخیص داده میشه. `pre` و `code` همیشه LTR می‌مونن.
- **JS:** یک `MutationObserver` روی همین المنت‌ها `dir="auto"` می‌ذاره. این کار برای پیام‌هایی هم که به‌صورت stream میان انجام میشه، و باعث میشه bullet لیست‌ها هم سمت درست قرار بگیرن.
- **`patch.sh`** فقط یک خط از `extension.js` اکستنشن رو عوض می‌کنه. توی تابع `buildIframeUrl`، آدرس `iframe` از `wrap()` پراکسی رد میشه:

```js
// قبل
a.search=m.toString();return a.toString()}
// بعد
a.search=m.toString();try{return require(".../rtl-proxy.js").wrap(a.toString())}catch(agyRtl){return a.toString()}}
```

اگه پراکسی به هر دلیلی خطا بده، آدرس اصلی برمی‌گرده و اکستنشن مثل قبل کار می‌کنه.

## نصب

</div>

```bash
git clone https://github.com/njfamirm/vscode-antigravity-rtl.git ~/.local/share/vscode-antigravity-rtl
~/.local/share/vscode-antigravity-rtl/patch.sh
```

<div dir="rtl">

بعدش VS Code رو کامل ببند و دوباره باز کن. بعد از هر آپدیت اکستنشن، `patch.sh` رو دوباره اجرا کن.

> اگه خطای `Could not register service worker` گرفتی، این یک باگ VS Code هست. VS Code رو کامل ببند و پوشهٔ `~/.config/Code/Service Worker` رو پاک کن.

## حذف

`patch.sh` قبل از تغییر، یک نسخه از فایل اصلی رو با پسوند `extension.js.orig` ذخیره می‌کنه:

</div>

```bash
for d in ~/.vscode/extensions/google.google-antigravity-*/; do cp "$d/extension.js.orig" "$d/extension.js"; done
```

<div dir="rtl">

## محدودیت‌ها

- روی لینوکس با اکستنشن نسخهٔ `1.10.0` تست شده. اگه گوگل کد `buildIframeUrl` رو عوض کنه، `patch.sh` خطا میده و فایل رو دست نمی‌زنه.
- مسیر پوشهٔ اکستنشن‌ها `~/.vscode/extensions` در نظر گرفته شده.

</div>

## License

MIT
