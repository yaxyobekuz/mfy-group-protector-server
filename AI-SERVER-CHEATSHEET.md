# AI SHLYUZI — TEKSHIRILGAN FAKTLAR

Kodda bu faylga `AI-SERVER-CHEATSHEET.md`, §N ko'rinishida havola
qilinadi (`signal-ai.constants.ts`, `mobile-ai.constants.ts`,
`.env.example`, `README.md`). **§ raqamlarini o'zgartirmang** — havolalar
uziladi.

> ⚠️ **BU FAYLGA FAQAT TIRIK TEKSHIRILGAN NARSA YOZILADI.** Har bandda
> tekshirilgan sana turadi. Taxmin yoki "shunday bo'lsa kerak" degan gap
> bu yerga tushmaydi — u §10 ga, "tekshirilmagan" ro'yxatiga tushadi.
> Sababi oddiy: kod bu fayldagi gaplarga tayanib qaror qabul qiladi,
> ya'ni noto'g'ri yozilgan bir qator keyin kodda nosozlikka aylanadi.

---

## §1. Shlyuz manzili va kaliti

| | |
|---|---|
| Manzil | `https://api.vircity.uz/v1` |
| `.env` | `AI_BASE_URL`, `AI_API_KEY` |
| Standart qiymat | `AI_BASE_URL` kodda standart qiymatga ega (`env.config.ts`) |

⚠️ **NOMI `OPENAI_*` EMAS, `AI_*`.** Model OpenAI'da emas, **o'zimizning
serverda** ishlaydi. Eskicha nom keyin o'qigan odamni
`platform.openai.com` dan kalit izlashga yuborardi.

⚠️ **`baseURL` BERISH MAJBURIY.** `openai` SDK standart holda
`api.openai.com` ga boradi — berilmasa bizning kalit begona serverga
ketadi va xato **401** bo'lib ko'rinadi, ya'ni sababini (manzil) topish
qiyin bo'ladi.

**Chaqiruv PUL YECHMAYDI** — model o'zimizning serverda. Lekin tezlik
chegarasi (`throttle.ts`) **o'rnida qoladi**: shlyuz **bir dona** va uni
skript bilan to'ldirish butun tahlilni sekinlashtiradi.

---

## §2. Modellar

`GET /models` — **2026-11-18 da ikki yozuv qaytardi**:

| Model | Holati |
|---|---|
| `qwen3.5:122b` | **Biz ishlatayotganimiz.** Tasniflash uchun tekshirilgan (§7) |
| `foundation-sec:8b` | **Ishlatilmaydi.** Javob beradi, lekin bu ish uchun yaroqsiz |

⚠️ **AVVAL BITTA MODEL BOR EDI.** 2026-11-07 holatiga `GET /models`
bitta yozuv qaytarardi va kodda "tanlov yo'q" deb yozilgan edi. **Endi
tanlov bor** — shuning uchun model nomi uch joyda **qo'lda** ushlab
turiladi va birini o'zgartirgan odam qolganini ham o'zgartirishi shart:

- `src/modules/signals/ai/signal-ai.constants.ts`
- `src/modules/mobile/ai/mobile-ai.constants.ts`
- `src/modules/reports/reports-ai.service.ts`

Agar ular ajralib ketsa, bir xil matn guruh oqimida va mobil oqimda
**boshqa-boshqa toifaga** tushadi.

### `foundation-sec:8b` nega ishlatilmaydi

Tekshirilgan (2026-11-18): "suv yo'q degan xabar shikoyatmi?" so'roviga
u javobni **xavfsizlik muammosi** sifatida qayta o'rab berdi ("bir xil
xavfsizlik muammoi bo'la olishi mumkin... suv resurslari
yetishmovchanligi") va o'zbek tili **buzuq** chiqdi. Bu — boshqa
maqsadga (kiberxavfsizlik) qurilgan ancha kichik model. MFY shikoyatini
toifalash uchun **tekshirilmagan va mos emas**.

⚠️ **MODEL NOMI KODDA, SOZLAMADA EMAS.** `.env` ga yoki panelga
chiqarilsa, kimdir uni tasodifan almashtirib, butun tahlil **jim**
buzilishi mumkin. Model almashtirish — kod o'zgarishi, review'dan
o'tadi.

---

## §3. OpenAI mosligi va ko'rsatmaga bo'ysunish

**API OpenAI bilan MOS** (tekshirilgan 2026-11-18): `openai` npm paketi
o'z joyida qoladi, faqat `baseURL` almashadi. Qo'lda `fetch` yozish
SSE'ni, qayta urinishni va timeout'ni qaytadan yozishni talab qilardi.

Tekshirilgan endpoint'lar: `GET /models`, `POST /chat/completions`.

### ⚠️ MODEL KO'RSATMANI *TAXMINAN* BAJARADI

`reply with one word: working` so'rovi **3 marta** yuborilganda
(2026-11-18):

```
1-urinish → "Yes"
2-urinish → "working"
3-urinish → "Working"
```

Bitta so'rov, uch xil javob — ikkitasi ko'rsatmaga **rioya qilmagan**.

**Xulosa: PROMPT — KAFOLAT EMAS.** Shuning uchun javob shakli va
qiymatlari **kodda qayta tekshiriladi** (`normalizeSignal`): begona
`kind`, o'ylab topilgan `messageId` tashlanadi. Promptni kuchaytirish bu
tekshiruvning **o'rnini bosmaydi** — ikkisi birga ishlaydi.

---

## §4. Autentifikatsiya

| Holat | Javob |
|---|---|
| To'g'ri kalit | `200` |
| Noto'g'ri kalit | `401` |

Tekshirilgan 2026-11-18. Kalit `Authorization: Bearer <AI_API_KEY>`
sarlavhasida ketadi.

⚠️ **401 ni ko'rib darhol kalitni ayblamang** — §1 dagi ogohlantirish:
`baseURL` berilmaganda so'rov OpenAI'ga ketadi va u ham 401 qaytaradi.
Avval manzilni tekshiring.

---

## §5. Chaqiruv parametrlari

| Parametr | Holati (2026-11-18) |
|---|---|
| `max_tokens` | **Ishlaydi.** Biz shuni yuboramiz |
| `max_completion_tokens` | **Ham ishlaydi** — 20 berilganda javob aynan 20 tokenda `finish_reason: "length"` bilan kesildi |
| `response_format` | Ishlaydi — §6 |
| `temperature` | **YUBORILMAYDI** (quyida) |

⚠️ **AVVALGI IZOH ESKIRGAN.** Kodda "`max_completion_tokens` ni shlyuz
e'tiborsiz qoldiradi" deb yozilgan edi (2026-11-07). **Bu endi to'g'ri
emas** — yangi nom ham hurmat qilinadi. `max_tokens` shunchaki o'rnida
qoldirildi: u tekshirilgan va almashtirish hech narsa bermaydi.

### `temperature` nega yuborilmaydi

Avvalgi sabab (5.x modellari uni qabul qilmaydi) **endi tegishli emas**,
lekin qaror **ataylab saqlanadi**: bu **tasniflash** ishi va tasodifiylik
bu yerda foyda bermaydi — bir xil xabar har aylanishda bir xil toifaga
tushishi kerak. Shlyuzning standart qiymati bizning ishimizga mos.

---

## §6. JSON javob rejimlari

**IKKISI HAM ISHLAYDI** (tekshirilgan 2026-11-18):

| Rejim | Holati |
|---|---|
| `json_schema` | **Ishlaydi.** Biz shuni ishlatamiz |
| `json_object` | **Ham ishlaydi** — `{"a":1}` so'ralganda aynan shu qaytdi |

⚠️ **SABAB O'ZGARDI, QAROR O'SHA QOLDI.** Avval kodda "`json_object`
tekshirilmagan, shlyuz uni rad etsa tahlil butunlay ishlamay qoladi"
deyilgan edi. Endi ikkisi ham tekshirilgan, ya'ni tanlov **xavfsizlik
uchun emas, FOYDA uchun**:

- `json_object` faqat "JSON bo'lsin" deydi;
- `json_schema` **maydonlar va turlarni** ham bog'laydi — ya'ni
  `JSON.parse` dan keyin `signals` massivi borligiga ishonish mumkin.

Sxema berilganda `JSON.parse` ` ```json ` bloki ustida ham yiqilmaydi.

### ⚠️ SXEMA SHAKLNI BERADI, QIYMATNI EMAS

`kind` ga `enum` berilgan bo'lsa **ham** model begona qiymat qaytarishi
mumkin. Shuning uchun ro'yxat **uch joyda** turadi va uchtasi
bir-birining o'rnini bosmaydi:

```
prompt  → modelga nima kerakligini AYTADI
sxema   → javob SHAKLINI (maydonlar, turlar) kafolatlaydi
kod     → QIYMATNI tekshiradi (yagona ISHONCHLI nuqta)
```

---

## §7. Tezlik, timeout va barqarorlik

**Haqiqiy hajmda o'lchangan** (2026-11-18, 15 xabarlik to'plam —
`MAX_MESSAGES_PER_CALL` bilan bir xil, to'liq tizim prompti bilan):

```
5 ta ketma-ket chaqiruv: 5/5 muvaffaqiyatli
min 1216ms · max 1681ms · o'rtacha 1382ms
finish_reason: "stop" (kesilish yo'q) · ~1800 token
```

`GET /models` — 0.19s.

### ⚠️ SHLYUZ VAQTI-VAQTI BILAN UZILIB TURADI

**Tirik nosozlik, 2026-11-18 07:24–07:29:** 24 guruhning **hammasi**
`Request timed out` bilan tushdi, 07:51 da esa **hammasi o'tdi** — bir
xil process, bir xil kod, bir xil hajm.

**Bu kod nosozligi EMAS, shlyuz tomoni.** Ikki belgi shuni ko'rsatadi:

1. Bizning `AI_TIMEOUT_MS` — **60 soniya**, xato esa **~21 soniyada**
   qaytdi: ya'ni so'rovni **shlyuzning o'zi** uzdi, biz emas.
2. 22 daqiqadan keyin hech narsa o'zgartirmasdan hammasi ishladi.

**Shuning uchun:** nosozlik logda **ko'rinib turadi** va
`failedGroups` sanoqchisi o'rnida qoladi. Navbat **yo'qolmaydi** —
xabarlar `analyzedAt` siz qoladi va keyingi aylanishda qayta ko'riladi.
Log'da takrorlanadigan bo'lsa — sabab shlyuzda, ma'murga aytish kerak.

### Chegaralar nega shunday

| Qiymat | Sabab |
|---|---|
| `MAX_MESSAGES_PER_CALL = 15` | **60 dan tushirildi** (2026-11-17 nosozlik): 60 xabarni bitta javobda tasniflash 122B model uchun og'ir ish va shlyuz so'rovni uzardi. Bu — **chetlab o'tish, tuzatish emas** |
| `AI_TIMEOUT_MS = 60_000` | Shlyuz bundan oldin (~21s) o'zi uzadi, ya'ni chegara bizdan kelmaydi |
| `MAX_OUTPUT_TOKENS = 8000` | Past qiymat JSON'ni yarmida kesib (`finish_reason: "length"`), guruhni har aylanishda "tahlil qilinmadi" holatida qoldirardi |

---

## §8. Raqam qaytarish xulqi — `#` belgisi

**Tekshirilgan 3 marta (2026-11-18):** ro'yxatda `#102`, `#103` berilib
raqam so'ralganda:

```
1-urinish → {"id":"#103"}   ← # BILAN
2-urinish → {"id":"102"}    ← # SIZ
3-urinish → {"id":"#103"}   ← # BILAN
```

**Ya'ni model raqamni ro'yxatda ko'rgan shaklida — `#` bilan —
qaytarishi mumkin, lekin har safar emas.** Navbat kaliti esa
**yalang'och** `"102"`.

⚠️ **SHUNING UCHUN `normalizeSignal` DA `.replace(/^#/, "")` BOR VA U
YUK KO'TARADI.** Tozalanmasa `byMessageId.get()` **har doim** bo'sh
qaytarib, **hamma** signal tashlanardi — va buni topish deyarli imkonsiz
bo'lardi:

- AI chaqiruvi **muvaffaqiyatli** (xato yo'q, log jim);
- xabarlar `analyzedAt` bilan belgilanadi (navbat o'smaydi);
- panelda esa **"0 signal"** — ya'ni "guruhda muammo yo'q" degan
  **xulosaga o'xshab** ko'rinardi.

Promptda ham aytilgan ("FAQAT RAQAM, `#` belgisisiz"), lekin §3 —
prompt kafolat emas.

---

## §9. MAVJUD BO'LMAGAN ENDPOINT'LAR

| Endpoint | Javob |
|---|---|
| `POST /embeddings` | **404** |

Tekshirilgan 2026-11-18.

⚠️ **EMBEDDING YO'Q** — demak bu shlyuz ustida **qurilmaydi**:

- semantik qidiruv,
- dublikat shikoyatni aniqlash,
- RAG.

Kerak bo'lsa **avval ma'murdan** embedding modelini yoqishni so'rash
kerak. Kodda bunga tayangan joy bo'lmasin: 404 ni ishlash paytida
topish — kech.

---

## §10. TEKSHIRILMAGAN (Not verified)

Bu band **ataylab** bor: "tekshirilgan" bilan "taxmin"ni ajratib turadi.

| Narsa | Holati |
|---|---|
| **Kontekst oynasi** | Hajmi **noma'lum**. `MAX_OUTPUT_TOKENS = 8000` shlyuz tomonidan rad etilsa, xato logga chiqadi va to'plam navbatda qoladi — **jim yo'qolmaydi** |
| Streaming (SSE) | Ishlatilmaydi, tekshirilmagan |
| `foundation-sec:8b` + `json_schema` | Tekshirilmagan — model baribir ishlatilmaydi (§2) |
| Bir vaqtda necha so'rov | Tekshirilmagan. `throttle.ts` chegarasi shu noaniqlik ustida turadi |
| Rasm/ko'rish (vision) | Tekshirilmagan |

---

## Qayerda ishlatiladi

| Modul | Vazifasi | Timeout |
|---|---|---|
| `signals/ai/signal-ai.service.ts` | Guruh xabarlaridan signal ajratish | 60s |
| `mobile/ai/mobile-ai.service.ts` | Mini App'da toifa taklifi | 30s |
| `reports/reports-ai.service.ts` | Hisobot matni | 60s |

**Uchalasi `qwen3.5:122b` ishlatadi** va uchtasida model nomi qo'lda
yozilgan — §2 ga qara.

⚠️ **UCHALASI HAM `null`/xatoni YUTADI, OTMAYDI.** Bu fon ishi: kalit
yo'q bo'lsa, model yiqilsa yoki javob shaklga to'g'ri kelmasa — ish
davom etadi, faqat AI qismi bo'lmaydi. AI'siz tizim o'z ishini
davom ettiraveradi (guruh kuzatuvi to'planadi, qo'lda muammo yuborish
ishlaydi).
