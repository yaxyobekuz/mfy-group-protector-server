# E Murojaat — Server (API)

MFY (mahalla) Telegram guruhlaridagi muammolarni aniqlash tizimining
ma'lumot va biznes-mantiq qatlami.

**Stack:** NestJS 11 · Prisma 6 · PostgreSQL · TypeScript · OpenAI

---

## Tizim nima qiladi

```
MFY guruhi            bot KUZATUVCHI sifatida o'qiydi
     ↓                (hech narsa yozmaydi, javob bermaydi)
group_messages        NAVBAT — tahlilsiz xom xabar
     ↓                AI (cron, har 30 daqiqada)
group_signals         AI TAXMINI — "bu gap muammoga o'xshaydi"
     ↓                ODAM qarori (panelda kategoriya tanlaydi)
issues                RASMIY MUROJAAT navbati
     ↓
javob → botga qaytadi (muallif qo'lda yuborgan bo'lsa)
```

## Asosiy doktrinalar

Bu qoidalar buzilsa tizim "ishlaydi", lekin ishonchini yo'qotadi.

### 1. Signal — muammo emas

`GroupSignal` va `Issue` — **ikki alohida jadval**. Xulosani AI
chiqargan, ya'ni u xato bo'lishi mumkin. `issues` esa ma'muriyat
**ishonadigan** rasmiy navbat — unga tekshirilmagan taxminni qo'yish
o'sha ishonchni buzadi.

O'tish faqat **odam qarori** bilan: `PATCH /api/signals/:id/attach`.

### 2. Hudud sozlamalarda biriktiriladi

Guruh nomida "Chilonzor 12-MFY" yozilgan bo'lishi mumkin, lekin unga
ishonib hisobot qurish mumkin emas (nom o'zgaradi, xato yoziladi,
umuman yozilmaydi). Shuning uchun `TelegramGroup.mahallaId` **qo'lda**
qo'yiladi va `null` bo'lishi normal holat.

### 3. Muammoda hudud muhrlanadi

`Issue.mahallaId` — **nusxa**, guruhdan jonli o'qilmaydi. Guruhning MFY
biriktirishi keyin o'zgarsa, "mart oyida Chilonzorda 12 ta murojaat"
degan raqam **o'zgarmaydi**.

Signalda esa aksincha — u guruh orqali o'qiladi: signal hali yangi va
uning hududi guruhning **joriy** holatidan kelib chiqishi to'g'ri.

### 4. Ruxsat va qamrov — ikki alohida narsa

| | Nima | Qayerda |
|---|---|---|
| **Ruxsat** | nima qila oladi | `User.permissions` → `common/permissions.ts` |
| **Qamrov** | kimning ma'lumotini ko'radi | `User.scopeKind` + `districtId` → `common/scope.util.ts` |

Tuman operatorida `signals.attach` ruxsati **bor**, lekin u faqat o'z
tumanidagi guruhdan chiqqan signalni biriktira oladi.

⚠️ Qamrov **har so'rovda serverda** qo'llanadi. Panel yuborgan
`districtId` — filtr, qamrovni kengaytira olmaydi.

### 5. AI matn yozmaydi

Model faqat **tanlaydi** (bu gap signalga arziydimi) va **toifalaydi**
(shikoyat / taklif / savol). Panelda ko'rinadigan matn — **xabarning
o'zi**. Avval model qisqa sarlavha yozardi va u har safar "...haqida
shikoyat bor" degan o'ramga aylanib, odamning o'z gapini
uzoqlashtirardi.

### 6. Guruh xabarlari — navbat, arxiv emas

`group_messages` tahlildan 24 soat keyin **o'chiriladi**: bu aholining
yozishmasi va uni saqlab qolish kerak emas. Signal qoladi, chunki unga
kerakli hamma narsa (matn, muallif, vaqt) ko'chirib olingan.

### 7. Model nomi kodda, shlyuz manzili `.env` da

`signals/ai/signal-ai.constants.ts`. Model almashtirish — kod
o'zgarishi: u xulosaning sifatiga va javob shakliga ta'sir qiladi.

Manzil esa `.env` dan (`AI_BASE_URL`): u **infratuzilma** — domen
ko'chishi mumkin, model esa sifat masalasi va review'dan o'tishi kerak.

### 8. AI — o'zimizning shlyuz

Model `api.vircity.uz` da ishlaydi, chaqiruv **bepul**
(`AI-SERVER-CHEATSHEET.md`). API OpenAI bilan **mos**, shuning uchun
`openai` paketi qoladi va faqat `baseURL` qo'shiladi.

⚠️ **Embedding yo'q** (`/embeddings` → 404): semantik qidiruv va RAG
bu shlyuz ustida qurilmaydi.

---

## Ishga tushirish

```bash
cp .env.example .env     # qiymatlarni to'ldiring
npm install              # postinstall: prisma generate
npm run prisma:migrate   # jadvallarni yaratadi
npm run db:seed          # kategoriyalar + tizim egasi
npm run start:dev
```

Server: `http://localhost:4000/api`

### Majburiy sozlamalar

| | Nima uchun |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | **Ikki alohida sir** — bitta sir ishlatilsa access token refresh sifatida o'tib ketish xavfi tug'iladi |
| `BOT_API_KEY` | Bot shu kalit bilan kiradi (`X-Bot-Key`). Botda JWT yo'q: u foydalanuvchi emas, ishonchli xizmat |

### Majburiy emas

| | Bo'lmasa nima bo'ladi |
|---|---|
| `AI_API_KEY` | Xabarlar to'planadi, **tahlil qilinmaydi** (mobil taklif ham chiqmaydi). Tizim ishlaydi |
| `AI_BASE_URL` | Standart qiymat: `https://api.vircity.uz/v1` |
| `BOT_TOKEN` | Muammo javobi botga **yuborilmaydi**. Panelda ko'rinib turadi |

---

## Tuzilma

```
src/
├── config/env.config.ts      muhit — startup'da TEKSHIRILADI
├── common/
│   ├── permissions.ts        ruxsat katalogi (YAGONA manba)
│   ├── scope.util.ts         hududiy qamrov
│   ├── date.util.ts          sana formati (YAGONA manba)
│   ├── audit.service.ts      kim nima qildi
│   ├── guards/               JWT + ruxsat (GLOBAL)
│   ├── filters/              xato javobi (yagona shakl)
│   └── dto/                  sahifalash
├── prisma/                   bitta client, Proxy qatlami YO'Q
└── modules/
    ├── auth/                 login, refresh rotatsiya
    ├── users/                xodimlar, ruxsat, qamrov
    ├── territory/            tuman + MFY
    ├── groups/               reyestr + bot ingest
    ├── signals/              AI tahlili + attach/dismiss
    │   └── ai/               model, prompt, normalizatsiya
    ├── issues/               rasmiy navbat + bot endpoint'lari
    ├── reports/              kesimlar (hamma raqam BIR manbadan)
    ├── settings/             singleton
    └── audit/                jurnal (faqat o'qish)
```

---

## API

Hamma yo'l `/api` prefiksi bilan. Standart holda **hammasi yopiq**
(`JwtAuthGuard` global) — ochiq endpoint `@Public()` bilan belgilanadi.

### Kirish

| Metod | Yo'l | |
|---|---|---|
| POST | `/auth/login` | ochiq |
| POST | `/auth/refresh` | ochiq, **rotatsiya bilan** |
| POST | `/auth/logout` | ochiq (muddati tugagan token bilan ham chiqish mumkin) |
| GET | `/auth/me` | ruxsatlar **bazadan**, tokendan emas |

### Panel

| | Yo'l | Ruxsat |
|---|---|---|
| Guruhlar | `GET /groups`, `GET /groups/stats` | `groups.view` |
| | `PATCH /groups/:chatId/official` | `groups.official` |
| | `PATCH /groups/:chatId/mahalla` | `groups.assign` |
| Xavfsizlik | `GET /security/events`, `/security/stats` | `security.view` |
| | `PATCH /security/groups/:chatId/guard` | `security.guard` |
| Signallar | `GET /signals`, `/signals/counts`, `/signals/status` | `signals.view` |
| | `POST /signals/run` | `signals.run` |
| | `PATCH /signals/:id/attach` | `signals.attach` |
| | `PATCH /signals/:id/dismiss` | `signals.dismiss` |
| Muammolar | `GET /issues`, `/issues/stats`, `/issues/:id` | `issues.view` |
| | `POST /issues` | `issues.create` |
| | `PATCH /issues/:id/assign` | `issues.assign` |
| | `PATCH /issues/:id/resolve`, `/reopen` | `issues.resolve` |
| | `POST /issues/:id/comments` | `issues.comment` |
| Kategoriyalar | `GET /issue-categories` | `issues.view` |
| | `POST`/`PATCH`/`DELETE` | `issues.categories` |
| Hudud | `GET /territory/districts`, `/mahallas` | `territory.view` |
| | `POST`/`PATCH` | `territory.manage` |
| Xodimlar | `GET /users`, `/users/permissions-catalog` | `users.view` |
| | `POST`/`PATCH` | `users.manage` |
| Hisobot | `GET /reports/{overview,territory,categories,signals,daily}` | `reports.view` |
| Sozlama | `GET /settings` · `PATCH /settings` | — · `settings.manage` |
| Audit | `GET /audit` | `audit.view` |

### Bot (`X-Bot-Key`)

| Metod | Yo'l | |
|---|---|---|
| POST | `/bot/groups/membership` | `my_chat_member` hodisasi |
| POST | `/bot/groups/touch` | guruhdan xabar keldi → javobda `isOfficial` |
| POST | `/bot/groups/messages` | rasmiy guruh xabarini navbatga |
| POST | `/bot/issues/link-check` | telegram bog'langanmi |
| GET | `/bot/issues/categories` | faol kategoriyalar |
| POST | `/bot/issues` | muammo yuborish |
| GET | `/bot/security/config/:chatId` | qalqon sozlamasi + qora ro'yxat |
| POST | `/bot/security/events` | tahdid aniqlandi/o'chirildi |

⚠️ Muallif **`telegramId` bo'yicha** topiladi, bot aytgan `userId`
bo'yicha emas: kalit tarqalgan bo'lsa, istalgan xodim nomidan yozish
mumkin bo'lardi.

---

## Nozik joylar

**Refresh token qayta ishlatilsa** — bu o'g'irlanish belgisi (haqiqiy
mijoz allaqachon yangisini olgan). O'shanda xodimning **barcha**
sessiyalari yopiladi.

**`updateMany` + holat sharti** (`signals.service.ts#attach`) —
compare-and-swap. Ikki operator bir vaqtda bosgan holatda ikkinchisi 0
qator yangilaydi va xato oladi. `update` ishlatilsa ikkinchisi
birinchining natijasini jimgina ustiga yozardi.

**AI yiqilsa `analyzedAt` qo'yilmaydi** — xabar navbatda qoladi va
keyingi aylanishda qayta ko'riladi. Qo'yilsa u tahlilsiz qolib,
jimgina yo'qolardi.

**Bir vaqtda bitta tahlil aylanishi** (`signals.job.ts`). Panelda
"Hozir tekshirish" tugmasi cron bilan ustma-ust tushishi mumkin: ikki
aylanish ayni xabarlarni o'qib, ayni signalni ikki marta yozardi — AI
hisobi ham ikki barobar bo'lardi.

**Cron ifodasi qotib qolmagan**: job har daqiqada ishga tushadi va
"vaqti keldimi" deb o'zi tekshiradi (`Settings.aiIntervalMinutes`).
Ifoda kodda bo'lsa, oraliqni o'zgartirish uchun deploy kerak bo'lardi.

**Rasmiy belgi olinganda navbat tozalanadi**: rozilik qaytarib
olingandan keyin tahlilsiz xabarlarni saqlab qolish "o'qimaymiz" degan
qarorga qarshi bo'lardi.

**`parse_mode: "HTML"`** — shuning uchun `escapeHtml` majburiy. Aholi
yozgan matnda `<` yoki `&` bo'lsa ("narx < 100000"), Telegram butun
xabarni rad etadi (400) va javob hech qachon yetib bormasdi.

---

## Sana formati

Yagona manba: `common/date.util.ts`.

```
kun         →  21-may, 2025
kun + vaqt  →  21-may, 2025 14:30
oy          →  Yanvar, 2026
vaqt        →  14:30
```

⚠️ `toLocaleDateString()`, `Intl.DateTimeFormat` va qo'lda yig'ilgan
`${day}.${month}.${year}` **taqiqlangan**: natija kod **ishlayotgan**
muhitning locale'iga bog'liq bo'lib, bitta jadvalda "21-may, 2025" va
"21.05.2025" yonma-yon turib qolardi.

⚠️ `getHours()` ham ishlatilmaydi — u **serverning** zonasini beradi
(konteynerda deyarli har doim UTC). Toshkent devor-soati `+5` qo'shib,
`getUTC*` bilan o'qiladi.

---

# Do'konga chiqarish (App Store / Google Play)

Mobil ilova (`uz.mysrv.nazoratchi`) shu serverning `/api/mobile/*`
endpointlaridan foydalanadi. Do'konlar quyidagilarsiz ilovani **rad
etadi** — har bir band talabning o'zi bilan izohlangan.

## Hisobni o'chirish — MAJBURIY

> Apple 5.1.1(v) · Google Play "Data deletion"

```
DELETE /api/mobile/me     @CitizenOnly()  →  204
```

Ilova ichida: **Profil → Hisobni o'chirish**. "Bizga yozing, qo'lda
o'chiramiz" degan variant **qabul qilinmaydi**.

**Nima bo'ladi** (bitta tranzaksiyada, `mobile.service.ts#deleteMe`):

| | |
|---|---|
| Shaxsiy maydonlar | tozalanadi — `firstName` → `"O'chirilgan foydalanuvchi"`, qolgani `null` |
| Kirish kalitlari | `telegramId` / `googleId` / `appleId` → **uchalasi** `null` |
| Ball va hudud | `points: 0`, `districtId`/`mahallaId` → `null` |
| `deletedAt` | qo'yiladi — qator **o'chirilmaydi** |
| Murojaat/izoh/fayl | **QOLADI**, muallifi anonim |
| Audit | `citizen.self_delete` (`userId: null` — amalni fuqaro qildi) |

⚠️ **Murojaat ataylab saqlanadi**: u hisobot birligi. "Oy ichida nechta
murojaat keldi" degan raqam bir odam hisobini o'chirgani uchun
o'zgarib ketmasligi kerak (`Issue.source` muhrlangan bo'lgani bilan
ayni sabab).

⚠️ **Murojaat MATNI o'zgarmaydi** va unda fuqaro o'zi yozgan shaxsiy
ma'lumot bo'lishi mumkin. Shu holat `/privacy` 6.2-bandida **aniq**
yozilgan — yashirib qo'yish do'kon tekshiruvida ham, qonun oldida ham
muammo bo'lardi.

⚠️ **Eski token darhol o'ladi**: `JwtAuthGuard#checkCitizen` har
so'rovda `deletedAt` ni **bazadan** tekshiradi. Mobil token 30 kunlik
va refresh yo'q, ya'ni imzo jihatidan hali ham haqiqiy — faqat bazani
tozalash yetarli emasdi.

⚠️ **Qayta kirish → yangi, bo'sh fuqaro**: kalitlar tozalangani uchun
`upsert` mos qator topmaydi. Eski murojaatlar tarixi qaytarilmaydi.

### Apple ruxsatini bekor qilish

Apple 5.1.1(v) Apple **tomonidagi** ruxsatni ham bekor qilishni talab
qiladi. Oqim:

```
kirish    POST /api/mobile/auth/apple  { identityToken, authorizationCode? }
             ↓ authorizationCode  →  appleid.apple.com/auth/token
          refresh_token  →  SHIFRLANIB bazaga (`Citizen.appleRefreshToken`)

o'chirish DELETE /api/mobile/me
             ↓ ochiladi  →  appleid.apple.com/auth/revoke
          logda: "Apple ruxsati bekor qilindi (/auth/revoke → 200)"
```

⚠️ **Token KIRISHDA olinadi, o'chirishda emas**: `authorizationCode`
bir martalik va bir necha daqiqada so'nadi — o'chirish paytida (oylar
keyin) uni almashtirib bo'lmaydi.

⚠️ **`authorizationCode` IXTIYORIY**: eski ilova versiyasi uni
yubormaydi va kirish baribir ishlaydi (faqat revoke o'tkazib
yuboriladi). Majburiy qilinsa, do'konda turgan eski versiyadagi
fuqarolar kirishdan uzilib qolardi.

⚠️ **Revoke xatosi o'chirishni TO'XTATMAYDI**: aks holda Apple
xizmati ishlamagan paytda fuqaro hisobini umuman o'chira olmasdi —
ya'ni do'kon talabi **buzilardi**. Xato logga tushadi,
`appleRevoked: false` esa auditda qoladi.

⚠️ **`refresh_token` SHIFRLANGAN** (`common/secret-box.ts`,
AES-256-GCM). U **tirik ruxsat**: o'qigan odam fuqaro nomidan Apple'dan
yangi `id_token` olishi mumkin. Xom yozilsa, baza dump'i tarqalganda
har bir iOS fuqaroning hisobi ochilib ketardi.

## Ommaviy sahifalar

`/api` prefiksidan **tashqarida** (`main.ts#setGlobalPrefix` istisnosi),
tokensiz ochiladi — do'kon formasiga **aynan shu** manzillar yoziladi:

| Manzil | Kim so'raydi |
|---|---|
| `/privacy` | App Store **va** Google Play |
| `/terms` | App Store |
| `/delete-account` | Google Play (ilovasiz ham ochilishi kerak) |

Matnlar `server/public/` da (`legal.controller.ts` beradi).

⚠️ **USLUB ALOHIDA FAYLDA** (`/legal.css`), sahifa ichida emas:
`helmet` CSP ichki `<style>` blokini **bloklaydi** va sahifa bezaksiz
ochilardi — xato esa faqat brauzer konsolida ko'rinib, server logida
jim qolardi.

⚠️ **`public/` `dist` GA NUSXALANMAYDI**: yo'l `process.cwd()` dan
olinadi, ya'ni `src` dan ham, `dist` dan ham ayni papka topiladi.
**Deploy'da `public/` ni kod bilan birga ko'chirish shart** — aks
holda sahifalar 404 beradi va logda "public/ papkasi joyidami?" degan
xato chiqadi.

## Tezlik chegaralari

Qiymatlar — `common/throttle.ts` (**yagona manba**).

| Chegara | Daqiqada | Nima bo'yicha |
|---|---|---|
| global | 300 | token bo'lsa — id, yo'q bo'lsa — IP |
| `auth/*` (fuqaro **va** xodim) | 10 | IP (token hali yo'q) |
| `POST /mobile/uploads` | 30 | fuqaro |
| `POST /mobile/appeals` | 10 | fuqaro |
| `POST /mobile/appeals/analyze` | 8 | fuqaro |

⚠️ **ID BO'YICHA, IP BO'YICHA EMAS** (`guards/throttler.guard.ts`):
mobil operator NAT ortida o'nlab fuqaro **bitta** IP bilan chiqadi va
IP bo'yicha cheklansa, qo'shnisi ilovadan foydalangani uchun boshqa
odam 429 olardi. Teskarisi ham: Wi-Fi → mobil internet o'tishida IP
o'zgaradi, ya'ni chegarani aylanib o'tish oson bo'lardi.

⚠️ **GUARD TARTIBI**: `AppThrottlerGuard` `JwtAuthGuard` **dan keyin**
turadi (`app.module.ts`) — u `request.citizen` ga tayanadi va oldinga
qo'yilsa butun mantiq **jimgina** IP rejimiga tushardi.

⚠️ **BOT CHEGARALANMAYDI** (`@BotOnly()` o'tkazib yuboriladi): butun
MFY guruhlari yozishmasi bitta jarayondan, bitta IP bilan o'tadi va
faol kunda global chegaraga urilardi — o'shanda guruh kuzatuvi va
**xavfsizlik qalqoni** jimgina ishlamay qolardi. Bot yo'lining himoyasi
— **kalit**, tezlik emas.

⚠️ **XOTIRADA SANALADI**: PM2 `cluster` rejimida har nusxa **o'z**
hisobini yuritadi va amaldagi chegara nusxalar soniga ko'payadi. Bitta
nusxada (`fork`) ishlatilsa muammo yo'q; cluster kerak bo'lsa Redis
saqlagichi qo'shiladi.

⚠️ **`Settings.mobileDailyLimit` O'RNINI BOSMAYDI**: u "kunda nechta
murojaat" degan **ma'muriy** qoida (sozlamadan), bu esa "daqiqada
nechta so'rov" degan **texnik** himoya. Ikkisi birga ishlaydi.

## Fayl yuklash

- Tur **ichidagi baytlardan** aniqlanadi, `Content-Type` dan emas.
- `POST /mobile/uploads` — **faqat surat**: ilova `pickImage` ishlatadi,
  ya'ni undan video kelishi mumkin emas. Bot yo'li esa videoni qabul
  qiladi (fuqaro Telegram'da ataylab yuboradi — haqiqiy dalil).
- Hajm: `MAX_FILE_SIZE` = 25 MB, **ikki joyda** tekshiriladi
  (`FileInterceptor` HTTP yo'lida, `UploadsService` esa har yo'lda —
  bot baytlari Telegram'dan keladi va interceptor ishtirok etmaydi).

⚠️ **`/uploads/*` HAVOLASI BOR HAR KIMGA OCHIQ**. Diskdagi nom
`randomUUID()`, ya'ni taxmin qilib topib bo'lmaydi, lekin havolani
bilgan odam ocha oladi. Bu holat `/privacy` 4-bandida **aniq**
yozilgan. Imzolangan muddatli havolaga o'tish — keyingi qadam
(`signed-ref.ts` naqshi allaqachon bor, lekin `useStaticAssets`
o'rniga controller kerak bo'ladi).

## API hujjati (Swagger)

```
development  →  /api/docs  OCHIQ (shartsiz)
production   →  YOPIQ; ochish uchun SWAGGER_ENABLED=true + PAROL
```

⚠️ Parolsiz yoqilsa hujjat **ulanmaydi** va sabab logga chiqadi:
"yoqdim, lekin parolni unutdim" holati ochiq hujjat bo'lib qolardi.
Hujjat butun API tuzilmasini, DTO maydonlarini va ruxsat nomlarini
oshkor qiladi.

## Monitoring

```
GET /api/health  →  200 { status, database, latencyMs }  |  503
```

⚠️ **BAZA HAM TEKSHIRILADI** (`SELECT 1`), faqat "server javob berdi"
emas: Nest baza uzilganda ham so'rovlarga javob beraveradi va o'shanda
monitoring "hammasi yaxshi" deb ko'rsatardi — murojaat yuborish esa 500
qaytarardi.

⚠️ Nosozlikda **503**, 200 emas: monitoring **holat kodiga** qaraydi,
javob ichidagi `"status": "down"` satriga emas.

## Fuqaro boshqa fuqaroning kontentini KO'RMAYDI

> Apple 1.2 (UGC shikoyat tizimi) — **hozircha talab emas**

Har murojaat so'rovi `citizenId` bilan cheklangan
(`mobile.service.ts`), ya'ni murojaat matni, surati, manzili va
telefoni **faqat** egasiga va ma'muriyatga ko'rinadi. Fuqarolarga
ko'rinadigan yagona umumiy ro'yxat — **reyting**: ism, surat, ball va
tuman.

⚠️ **AGAR** kelajakda xaritada yoki boshqa joyda **boshqa**
fuqaroning matni/rasmi ko'rsatilsa, Apple 1.2 kuchga kiradi va
`POST /api/mobile/reports` (kontentga shikoyat) + paneldagi ko'rib
chiqish ro'yxati **majburiy** bo'ladi. Hozir u yozilmagan — ishlatilmay
turgan endpoint o'zi ham xavf (test qilinmaydi, eskiradi).

---

# Deploy cheklisti

## Muhit o'zgaruvchilari

```bash
NODE_ENV=production      # auth/dev ni YOPADI va Swagger'ni o'chiradi
```

**Sirlar — har biri ALOHIDA, kamida 32 belgi tasodifiy:**

```bash
openssl rand -base64 48   # har biri uchun alohida ishga tushiring
```

| O'zgaruvchi | Nima uchun alohida |
|---|---|
| `JWT_ACCESS_SECRET` | refresh token access sifatida o'tib ketmasligi uchun |
| `JWT_REFRESH_SECRET` | ⬆ |
| `MOBILE_JWT_SECRET` | **uchinchi** sir — fuqaro tokeni panelga **struktura jihatidan** kira olmaydi |
| `BOT_API_KEY` | bot — foydalanuvchi emas, xizmat |

⚠️ **`MOBILE_JWT_SECRET` IKKI ISHNI BAJARADI**: fuqaro tokenini
imzolaydi **va** imzolangan havolalar (upload token, AI taklifi) hamda
Apple `refresh_token` shifri uchun kalit beradi (kontekst bilan
ajratilgan — `signed-ref.ts`, `secret-box.ts`). **Almashtirilsa**:
ochiq qoralamalar va saqlangan Apple tokenlari yaroqsiz bo'ladi
(revoke o'tkazib yuboriladi, o'chirish esa ishlayveradi).

**Kirish yo'llari:**

```bash
GOOGLE_CLIENT_ID=""      # WEB turidagi mijoz id'si, Android/iOS niki EMAS
GOOGLE_IOS_CLIENT_ID=""  # iOS'da `aud` BOSHQA bo'ladi — alohida
APPLE_CLIENT_ID="uz.mysrv.nazoratchi"   # BUNDLE ID, "Services ID" emas
APPLE_TEAM_ID="" APPLE_KEY_ID=""        # revoke uchun
APPLE_PRIVATE_KEY_PATH="/var/lib/e-murojaat/AuthKey_XXXXXXXXXX.p8"
```

⚠️ `.p8` kaliti **kod katalogidan tashqarida** va **`git` dan
tashqarida** — bu tirik kalit.

**Birinchi xodim:**

```bash
SEED_OWNER_PASSWORD="<kuchli-tasodifiy>"   # `owner123` EMAS
```

⚠️ Seed'dan **keyin** parol panel orqali almashtiriladi va
`SEED_OWNER_PASSWORD` muhitdan **olib tashlanadi**.

**Fayllar:**

```bash
UPLOADS_DIR="/var/lib/e-murojaat/uploads"   # KOD KATALOGIDAN TASHQARIDA
```

⚠️ Standart qiymat loyiha ichiga tushadi va konteyner qayta
qurilganda fayllar **kod bilan birga ketadi**. Bazada esa faqat yo'l
qoladi: panelda murojaat ko'rinib turadi, **dalili** esa yo'q bo'ladi.

## Infratuzilma

- [ ] **HTTPS** — `api.e-murojaat.org` (nginx + certbot).
      Do'kon HTTP manzilni qabul qilmaydi; Apple ATS ham bloklaydi.
- [ ] `CORS_ORIGINS` — panel manzili (`*` **emas**: panel
      `credentials: true` bilan ishlaydi va brauzer `*` + credentials
      birikmasini rad etadi).
- [ ] **Teskari proksi `X-Forwarded-For` uzatsin** — aks holda nginx
      ortida har so'rov `127.0.0.1` bo'lib ko'rinadi va tezlik
      chegarasi **butun internetni bitta chelakka** soladi.
- [ ] `public/` papkasi kod bilan birga ko'chirilgan.
- [ ] Jarayon menejeri: PM2 (`fork`, `--max-restarts`) yoki Docker
      `restart: unless-stopped`.
- [ ] `prisma migrate deploy` — **deploy jarayonining qadami**
      (`migrate dev` ishlab chiqarishda **ishlatilmaydi**: u schema'ni
      qayta yaratishi mumkin).

```bash
npm ci && npx prisma migrate deploy && npm run build && npm run start
```

## Zaxira nusxa

Kunlik, **ikkisi birga** — biri ikkinchisisiz ma'nosiz:

```bash
pg_dump e_murojaat            # murojaat yozuvlari
tar -C /var/lib/e-murojaat    # ularning DALILLARI (uploads)
```

⚠️ **Bazani tiklab, fayllarni tiklamaslik** murojaatni dalilsiz
qoldiradi — "Fayl — dalil, bezak emas" qoidasi shunisiz saqlanmaydi.

⚠️ Dump ichida **shifrlangan** Apple tokenlari bor. Ular
`MOBILE_JWT_SECRET` siz ochilmaydi, ya'ni **sir dump bilan bitta
joyda saqlanmasligi** kerak.

## Qabul qilish tekshiruvi

```bash
curl -s https://HOST/privacy        -o /dev/null -w "%{http_code}\n"   # 200
curl -s https://HOST/terms          -o /dev/null -w "%{http_code}\n"   # 200
curl -s https://HOST/delete-account -o /dev/null -w "%{http_code}\n"   # 200
curl -s https://HOST/api/health                                        # status: ok
curl -s https://HOST/api/docs       -o /dev/null -w "%{http_code}\n"   # 404 yoki 401

# Chegara: ketma-ket 12 so'rov → oxirgilari 429
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  curl -s -o /dev/null -w "%{http_code} " -X POST https://HOST/api/auth/login \
    -H "Content-Type: application/json" -d '{"username":"x","password":"xxxxxxxx"}'
done; echo
```

---

# Mobil dasturchiga — o'zgargan endpointlar

| Endpoint | O'zgarish |
|---|---|
| `DELETE /api/mobile/me` | **YANGI**. `@CitizenOnly()`, javob **204** (tanasi bo'sh). Tasdiqni **ilova** so'raydi. Keyin token yaroqsiz → kirish ekraniga qaytarish. |
| `POST /api/mobile/auth/apple` | `authorizationCode` **qo'shildi** (ixtiyoriy, `MaxLength(1024)`). `sign_in_with_apple` qaytargan `credential.authorizationCode` ni **birga yuboring** — usiz Apple ruxsati bekor qilinmaydi (App Store 5.1.1(v)). |
| `POST /api/mobile/uploads` | Endi **faqat surat** qabul qiladi (video → 400 `"Bu yerda faqat surat yuborish mumkin"`). |
| barcha endpointlar | **429** holati paydo bo'ldi — `message` ni foydalanuvchiga ko'rsatish kifoya (o'zbekcha matn serverdan keladi). |
| barcha `@CitizenOnly()` | Hisob o'chirilgan bo'lsa **401** (ilgari faqat `isBlocked` → 403 edi). 401 → kirish ekraniga. |

**Ilovada qo'shilishi kerak:**

- `Profil → Hisobni o'chirish` tugmasi + ogohlantirish oynasi
  («murojaatlar anonim holda saqlanadi, qayta kirsangiz yangi profil
  yaratiladi»);
- `/privacy` va `/terms` havolalari (App Store formasi ham so'raydi);
- Apple kirishida `authorizationCode` ni yuborish.
