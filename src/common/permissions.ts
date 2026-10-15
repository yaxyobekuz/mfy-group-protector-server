/**
 * RUXSAT KATALOGI — YAGONA MANBA.
 *
 * ⚠️ PANELDA NUSXA YO'Q va bo'lmasligi kerak: u katalogni
 * `GET /users/permissions-catalog` orqali SHU FAYLDAN oladi. Nusxa
 * yaratilsa, u qo'lda sinxronni talab qilardi va albatta eskirardi —
 * panelda tugma ko'rinib, server 403 qaytarardi (yoki teskarisi, bu
 * xavfliroq).
 *
 * ── QAMROV VA RUXSAT — IKKI ALOHIDA NARSA ────────────────────────────
 *
 * ⚠️ Bu fayl "NIMA QILA OLADI" haqida. "KIMNING MA'LUMOTINI KO'RADI"
 * esa `User.scopeKind` + `districtId` da (`scope.util.ts`). Ikkisini
 * aralashtirmang: tuman operatorida `signals.attach` ruxsati BOR, lekin
 * u faqat O'Z TUMANIDAGI guruhdan chiqqan signalni biriktira oladi.
 * Ruxsat tekshiruvi qamrovni O'RNINI BOSMAYDI va teskarisi ham.
 *
 * ── AMALLAR NIMA UCHUN MAYDA ─────────────────────────────────────────
 *
 * ⚠️ "Ko'rish" va "o'zgartirish" ATAYLAB ajratilgan. Hisobot uchun
 * kirgan odamga guruhni rasmiy qilish yoki MFY biriktirish huquqini
 * berib qo'ymaslik kerak: `isOfficial` — KUZATUVGA ROZILIK va uni
 * tasodifan qo'yish aholining yozishmasini o'qib boshlash degani.
 */

/** Bitta ruxsat yozuvi — panelda shu matn ko'rinadi. */
export interface PermissionDef {
  /** Kodda ishlatiladigan kalit. */
  key: string;
  /** Panelda ko'rinadigan nom. */
  label: string;
  /** Nima uchun ehtiyot bo'lish kerakligi (panelda izoh). */
  hint?: string;
}

export interface PermissionGroup {
  key: string;
  label: string;
  items: PermissionDef[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "groups",
    label: "Telegram guruhlari",
    items: [
      { key: "groups.view", label: "Ro'yxatni ko'rish" },
      {
        key: "groups.official",
        label: "Rasmiy belgisini qo'yish",
        hint: "Bu belgi — guruh yozishmasini o'qishga ROZILIK. Tasodifan qo'yilsa tizim aholining xabarlarini to'play boshlaydi.",
      },
      {
        key: "groups.assign",
        label: "MFY biriktirish",
        hint: "Hududiy kesim shundan chiqadi: noto'g'ri biriktirish butun hisobotni buzadi.",
      },
    ],
  },
  {
    key: "security",
    label: "Xavfsizlik",
    items: [
      { key: "security.view", label: "Xavfsizlik jurnalini ko'rish" },
      {
        key: "security.guard",
        label: "Qalqonni yoqish/o'chirish",
        hint: "Qalqon yoqilgan guruhda bot zararli fayl va havolalarni O'CHIRADI. Bu qaytarib bo'lmaydigan amal — o'chirilgan xabarni tiklab bo'lmaydi.",
      },
    ],
  },
  {
    key: "signals",
    label: "Signallar (AI)",
    items: [
      { key: "signals.view", label: "Signallarni ko'rish" },
      {
        key: "signals.attach",
        label: "Muammoga biriktirish",
        hint: "Signal rasmiy murojaat navbatiga tushadi.",
      },
      { key: "signals.dismiss", label: "E'tiborsiz qoldirish" },
      {
        key: "signals.run",
        label: "Tahlilni qo'lda ishga tushirish",
        hint: "Har bosishda AI so'rovi ketadi — pul sarflanadi.",
      },
    ],
  },
  {
    key: "issues",
    label: "Muammolar",
    items: [
      { key: "issues.view", label: "Ro'yxatni ko'rish" },
      { key: "issues.create", label: "Qo'lda yaratish" },
      { key: "issues.assign", label: "Ijrochi belgilash" },
      {
        key: "issues.resolve",
        label: "Yopish (hal qilindi / rad etildi)",
        hint: "Javob matni botdagi muallifga yetib boradi.",
      },
      { key: "issues.comment", label: "Izoh yozish" },
      { key: "issues.categories", label: "Kategoriyalarni boshqarish" },
    ],
  },
  {
    key: "territory",
    label: "Hudud",
    items: [
      { key: "territory.view", label: "Tuman va MFY ro'yxati" },
      { key: "territory.manage", label: "Tuman va MFY qo'shish/tahrirlash" },
    ],
  },
  {
    key: "reports",
    label: "Hisobotlar",
    items: [{ key: "reports.view", label: "Hisobotlarni ko'rish" }],
  },
  {
    key: "system",
    label: "Tizim",
    items: [
      { key: "users.view", label: "Xodimlarni ko'rish" },
      {
        key: "users.manage",
        label: "Xodim qo'shish/tahrirlash",
        hint: "Ruxsat va hududiy qamrov ham shu yerdan beriladi.",
      },
      { key: "settings.manage", label: "Sozlamalar" },
      { key: "audit.view", label: "Audit jurnali" },
    ],
  },
];

/** Tekshiruv uchun tekis to'plam. */
export const ALL_PERMISSIONS: ReadonlySet<string> = new Set(
  PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key)),
);

/**
 * ROL UCHUN STANDART RUXSATLAR — xodim yaratilganda taklif qilinadi.
 *
 * ⚠️ BU "QOTIB QOLGAN ROL" EMAS: ruxsat har xodimda ALOHIDA saqlanadi
 * (`User.permissions`) va rol faqat BOSHLANG'ICH to'plamni beradi.
 * Rolga bog'lab qo'ysak, "bu operatorga qo'shimcha bitta huquq kerak"
 * degan oddiy talab yangi rol ochishga majbur qilardi.
 *
 * ⚠️ `owner` BU RO'YXATDA YO'Q: uning ruxsati umuman O'QILMAYDI
 * (`PermissionsGuard` uni darhol o'tkazadi). Ro'yxatga qo'shilsa,
 * yangi ruxsat qo'shilganda owner uni OLMAY qolishi mumkin edi.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  admin: [...ALL_PERMISSIONS],
  operator: [
    "groups.view",
    "groups.assign",
    // ⚠️ `security.guard` OPERATORDA YO'Q: qalqonni yoqish — botga
    // aholining xabarini o'chirish huquqini berish va bu
    // ma'muriyat qarori.
    "security.view",
    "signals.view",
    "signals.attach",
    "signals.dismiss",
    "issues.view",
    "issues.create",
    "issues.assign",
    "issues.resolve",
    "issues.comment",
    "territory.view",
    "reports.view",
  ],
  viewer: [
    "groups.view",
    "security.view",
    "signals.view",
    "issues.view",
    "territory.view",
    "reports.view",
  ],
};

/** Noma'lum kalitlarni ajratadi — xodim saqlashda tekshiriladi. */
export const findUnknownPermissions = (keys: string[]): string[] =>
  keys.filter((key) => !ALL_PERMISSIONS.has(key));
