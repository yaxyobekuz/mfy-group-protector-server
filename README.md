# Viloyat shtabi — Server (API)

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

### 7. Model nomi kodda

`signals/ai/signal-ai.constants.ts`. Model almashtirish — kod
o'zgarishi: u xulosaning sifatiga, narxiga va javob shakliga ta'sir
qiladi. `.env` dan faqat `OPENAI_API_KEY` o'qiladi.

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
| `OPENAI_API_KEY` | Xabarlar to'planadi, **tahlil qilinmaydi**. Tizim ishlaydi |
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
