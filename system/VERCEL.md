# نشر POS على Vercel

## المتطلبات

- حساب [Vercel](https://vercel.com)
- مستودع Git (GitHub/GitLab/Bitbucket) أو استخدام [Vercel CLI](https://vercel.com/docs/cli)
- قاعدة PostgreSQL جاهزة (مثلاً Supabase) وسلسلة اتصال صالحة

## هيكل المشروع

### مستودع الجذر فيه مجلد `system/` (أي اسم مشروع)

عيّن في Vercel **Settings → General → Root Directory** إما **`system`** (مُفضّل) أو **`.`** (جذر المستودع). في الحالتين يجب أن يعمل الـ API:
- مع Root = **`system`**: يُستخدم `system/vercel.json` و`system/api/[...slug].js`
- مع Root = **`.`**: يُستخدم `vercel.json` في الجذر و`api/[...slug].js` (يُوجّه إلى خادم Express داخل `system/`)

**لا** تضبط Root Directory على `system/client` فقط — ذلك ينشر الواجهة بدون API وستحصل على **404** لكل `/api/*`.

**Settings → Build & Development:** Framework Preset = **Other**. إذا كان **Override** على Build Command = `vite build` فألغِه.

من الطرفية من جذر الريبو: `npm run vercel:prod` (ينشر مجلد `system/` كجذر المشروع).

### مستودع Git = محتويات `system` فقط (بدون مجلد `system`)

اترك **Root Directory** على **`.`** واستخدم `vercel.json` داخل نفس الجذر.

### خطأ `vite build` / exit **127**

يحدث عندما يكون **Root Directory** على جذر الريبو (`.`) دون توجيه، فيكتشف Vercel Vite ويشغّل `vite build` مباشرة. الحل: **Root Directory = `system`** (أو `npm run vercel:prod` من جذر الريبو).

## أوامر البناء (مضبوطة في `vercel.json`)

| الإعداد            | القيمة                    |
|--------------------|---------------------------|
| Install Command    | `npm run install:all`     |
| Build Command      | `npm run build:vercel`    |
| Output Directory   | `client/dist`             |

`build:vercel` يشغّل: `prisma generate` + بناء الواجهة (Vite + PWA). **لا يشغّل `migrate deploy` أثناء البناء** حتى لا يفشل النشر إذا لم تكن `DATABASE_URL` متاحة وقت البناء.

لتطبيق الهجرات على قاعدة الإنتاج (بعد تغيير `schema` أو عند أول إعداد):

- من جهازك (مع `DATABASE_URL` لقاعدة الإنتاج):  
  `npm run db:deploy --prefix server`  
- أو عرّف `DATABASE_URL` في Vercel واستخدم سكربت البناء البديل:  
  `build:vercel:migrate` (يضم `prisma migrate deploy` قبل بناء الواجهة).

## متغيرات البيئة في Vercel

أضفها في **Project → Settings → Environment Variables**، وفعّلها لـ **Production** (و **Preview** إن رغبت)، وتأكد أنها **متاحة عند البناء (Build)** حيث يلزم.

### ضرورية للسيرفر (Runtime + غالباً Build للـ migrate)

| المتغير           | ملاحظات |
|-------------------|---------|
| `DATABASE_URL`    | اتصال PostgreSQL. إذا فشل `migrate deploy` أثناء البناء مع Supabase، جرّب **رابط المنفذ 5432 المباشر** بدل الـ pooler، أو أضف لاحقاً `directUrl` في Prisma حسب [وثائق Prisma + Supabase](https://www.prisma.io/docs/orm/overview/databases/supabase). |
| `JWT_SECRET`      | سلسلة عشوائية طويلة (لا تستخدم قيم التطوير). |

### من `server/.env` حسب ما يستخدمه المشروع لديك

- `SUPABASE_URL`، `SUPABASE_ANON_KEY` (إن وُجدت في الكود)
- `PUBLIC_IMAGE_BASE_URL` أو ما يعادلها لصور المنتجات

### واجهة Vite (لازمة **عند البناء**)

| المتغير                 | ملاحظات |
|-------------------------|---------|
| `VITE_SUPABASE_URL`     | من Supabase |
| `VITE_SUPABASE_ANON_KEY`| من Supabase |
| `VITE_IMAGE_URL_PREFIX` / `VITE_PUBLIC_IMAGE_BASE_URL` | اختياري حسب الصور |

**لا تضبط `VITE_API_URL`** في الإنتاج إذا كان الـ API على **نفس نطاق Vercel**؛ الطلبات تذهب إلى `/api/...` على نفس الأصل.

## خطوات سريعة (لوحة Vercel)

1. **New Project** → استورد المستودع.
2. **Root Directory**: **`system`** إذا كان المستودع يحتوي مجلداً بهذا الاسم (أو `.` إن كان محتوى `system` فقط في جذر الريبو).
3. Framework Preset: **Other** (أو اترك الاكتشاف التلقائي إن قرأ `vercel.json`).
4. أضف متغيرات البيئة أعلاه.
5. **Deploy**.

## بعد النشر

- افتح الرابط: يجب أن تظهر صفحة تسجيل الدخول، وطلبات `GET /api/health` أو `/api/auth/me` تعمل عبر نفس النطاق.
- إن ظهرت أخطاء 500: راجع **Functions → Logs** في Vercel، وتأكد من `DATABASE_URL` و`JWT_SECRET` ونجاح `prisma migrate deploy` في سجل البناء.

## نشر بدون Git (CLI)

من جهازك، داخل مجلد `system`:

```bash
npx vercel login
npx vercel
```

للإنتاج:

```bash
npx vercel --prod
```

(يُفضّل ربط المستودع لاحقاً للنشر التلقائي.)

## ملاحظة عن Prisma على Vercel

- العميل يُولَّد في `server/node_modules/@prisma/client` (المسار الافتراضي) مع `binaryTargets` تشمل `rhel-openssl-3.0.x`.
- `vercel.json` يضمّن `server/node_modules/.prisma/**` داخل دالة الـ API.
- مع قواعد بعيدة يُنصح بـ **connection pooling** (مثلاً Supabase Transaction pooler في `DATABASE_URL` مع `?pgbouncer=true` إن طلبت الوثائق).

إن ظهر **FUNCTION_INVOCATION_FAILED** أو **ERR_REQUIRE_ESM** في السجلات: تأكد أن دالة الـ API هي `api/[...slug].cjs` (استيراد ديناميكي لـ Express ESM)، وليس `.js` مع `import` ثابت.

إن استمر 500 على `/api/health`: راجع **Functions → Logs** وتأكد من `DATABASE_URL` و`JWT_SECRET` في متغيرات Vercel (Production).
