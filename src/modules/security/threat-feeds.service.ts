/**
 * TASHQI TAHDID RO'YXATLARI — O'ZI YANGILANADIGAN QORA RO'YXAT.
 *
 * ── MUAMMO ────────────────────────────────────────────────────────────
 *
 * ⚠️ QO'LDAGI QORA RO'YXAT HAR DOIM KECHIKADI. Yangi firibgar domen
 * ertalab paydo bo'lib, kechqurun bloklanardi — oradagi vaqtda aholi
 * havolani bosib ulgurardi. Va kim ko'rib turibdi? Hech kim: panelga
 * domen qo'shish uchun avval kimdir uni SEZISHI kerak.
 *
 * ── YECHIM ────────────────────────────────────────────────────────────
 *
 * URLhaus, PhishTank, AdGuard va shunga o'xshash ro'yxatlar SOATLAB
 * yangilanadi va ularni o'qish qo'lda kiritishdan ko'ra tezroq. Server
 * ularni vaqti-vaqti bilan yuklab oladi, hostlarni ajratib bazaga
 * yozadi va botga BERADI.
 *
 * ── NIMA UCHUN BOTGA RO'YXAT BERILADI ─────────────────────────────────
 *
 * ⚠️ HAR XABAR UCHUN SERVERGA BORISH MUMKIN EMAS: o'chirish VAQTGA
 * bog'liq amal va server yiqilganda himoya ishlashda davom etishi
 * kerak (`detect.ts` dagi doktrina). Shuning uchun bot ro'yxatni
 * SOATDA BIR MARTA yuklab olib, XOTIRADA saqlaydi.
 *
 * ⚠️ RO'YXAT `guardConfig` GA QO'SHILMAYDI: u har guruh uchun, har 2
 * daqiqada so'raladi va 50 000 hostni har safar tashish tarmoqni
 * bekorga band qilardi. Alohida endpoint — alohida muddat.
 *
 * ── NIMA ALMASHTIRMAYDI ───────────────────────────────────────────────
 *
 * ⚠️ QO'LDAGI RO'YXAT O'RNINI BOSMAYDI, QO'SHIMCHA: mahalliy firibgar
 * domenlar (`uzbekistonviplata.xyz`) tashqi ro'yxatlarga umuman
 * tushmaydi. Ikkisi BIRGA ishlaydi.
 *
 * ⚠️ OQ RO'YXAT USTUN: `gov.uz` tashqi ro'yxatga xato bilan tushsa
 * ham o'chirilmaydi (`inspectUrl` dagi tartib — oq ro'yxat birinchi
 * tekshiriladi).
 */

import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ThreatFeedFormat } from "@prisma/client";

import { AuditService } from "../../common/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { normalizeHost } from "./threat-rules";

/**
 * BITTA RO'YXATDAN OLINADIGAN ENG KO'P HOST.
 *
 * ⚠️ CHEGARA KERAK: manba xato bilan 5 million qatorli fayl berishi
 * mumkin (yoki manzil o'zgarib, butunlay boshqa fayl qaytishi). Usiz
 * bitta noto'g'ri javob butun bazani va bot xotirasini to'ldirib
 * qo'yardi.
 */
const MAX_HOSTS_PER_FEED = 200_000;

/**
 * BOTGA BERILADIGAN RO'YXATNING UMUMIY CHEGARASI.
 *
 * ⚠️ `MAX_HOSTS_PER_FEED` DAN ALOHIDA SON va bu TIRIK sinovda
 * topilgan xato edi. Avval ikkisi AYNI qiymat (200 000) edi:
 * bitta ro'yxat (Phishing.Database, 11 MB) o'z chegarasini
 * to'ldirgach, botga yuboriladigan ro'yxat ham 200 000 ga
 * urildi — va qolgan uchta ro'yxatning 143 000 hosti
 * **jimgina tushib qoldi**. Qaysi birlari tushib qolgani esa
 * bazadagi tasodifiy qator tartibiga bog'liq edi.
 *
 * ⚠️ IKKISI IKKI BOSHQA QARORNI IFODALAYDI: biri — bitta
 * manbaga qancha ishonamiz, ikkinchisi — bot xotirasiga
 * qancha sig'adi. Ularni bitta sonda ushlash "bir manba
 * qolganlarini siqib chiqaradi" degan holatni yaratardi — va
 * doktrina aynan buning teskarisini talab qiladi: tashqi
 * ro'yxatlar BIRGA ishlaydi.
 *
 * ⚠️ 500 000 — BARCHA RO'YXATLAR YIG'INDISIDAN KATTA (hozir
 * ~343 000). Chegara baribir kerak: bot ro'yxatni XOTIRADA
 * saqlaydi va cheksiz o'sish uni yiqitardi.
 */
const MAX_BLOCKLIST_HOSTS = 500_000;

/**
 * YUKLAB OLISH UCHUN KUTISH VAQTI.
 *
 * ⚠️ UZUN (2 daqiqa) va bu TIRIK O'LCHOVDAN: GitHub'dagi fishing
 * ro'yxati 38 000 qator va u 60 soniyada ulgurmadi. Qisqa muddat
 * eng katta — ya'ni eng foydali — ro'yxatni JIMGINA chetlab
 * o'tardi.
 */
/**
 * RO'YXAT QANCHA VAQTDA BIR MARTA YANGILANADI.
 *
 * ⚠️ UCH KUN — MUROSA. Manbalar soatlab yangilanadi va firibgar
 * domen ertalab paydo bo'lib kechqurun bloklanishi mumkin, ya'ni
 * TEZROQ yangilash himoyani kuchaytiradi. Lekin har aylanishda
 * ~350 000 host qayta yuklanadi (bittasi 11 MB, ~50 soniya) — bu
 * manbalarning serveriga ham, bizning bazaga ham sezilarli yuk.
 *
 * ⚠️ CHEGARA ALOHIDA DOIMIYDA, kodga sochilgan emas: uni
 * o'zgartirish bitta qatorlik ish bo'lishi kerak.
 */
const REFRESH_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

const FETCH_TIMEOUT_MS = 180_000;

/**
 * ⚠️ ROSSIYA/MAHALLIY DOMENLAR EMAS, TEXNIK YOZUVLAR: `hosts`
 * faylida `localhost` kabi qatorlar bor va ular host sifatida
 * yozilsa, bot o'z serveriga qarshi ishlab ketardi.
 */
const SKIP_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "local",
  "broadcasthost",
  "ip6-localhost",
  "ip6-loopback",
  "ip6-localnet",
  "ip6-mcastprefix",
  "ip6-allnodes",
  "ip6-allrouters",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
]);

@Injectable()
export class ThreatFeedsService {
  private readonly logger = new Logger(ThreatFeedsService.name);

  /**
   * XOTIRADAGI RO'YXAT — BOTGA BERISH UCHUN.
   *
   * ⚠️ KESH KERAK: bot ro'yxatni so'raganda 50 000 qatorni bazadan
   * har safar o'qish sekin va bekorga. Ro'yxat sutkasiga bir necha
   * marta o'zgaradi, so'rov esa har soatda — kesh deyarli har doim
   * tayyor bo'ladi.
   *
   * ⚠️ `version` — O'ZGARISH BELGISI: bot uni eslab qoladi va
   * o'zgarmagan bo'lsa, ro'yxatni QAYTA YUKLAMAYDI (javob bo'sh
   * keladi). Tarmoq bekorga band bo'lmaydi.
   */
  private cache: { version: string; hosts: string[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  //  YANGILASH
  // ═══════════════════════════════════════════════════════════════

  /**
   * HAR 3 KUNDA — LEKIN CRON TEZROQ URINADI.
   *
   * ⚠️ MUDDAT CRON IFODASIDA EMAS, HAR RO'YXATNING O'ZIDA
   * (`lastFetchedAt`) — `signals.job.ts` bilan AYNI yondashuv.
   * Ifodaga "har uchinchi kun" deb yozilsa (kun maydonida qadam
   * bilan), u OY CHEGARASIDA buzilardi: 31-kundan keyin 1-kun
   * keladi va oraliq 3 kun o'rniga 1 kun bo'lib qolardi. Bundan tashqari server
   * qayta ishga tushganda cron o'tkazib yuborilgan vaqtni
   * BILMAYDI — ro'yxat yana 3 kun eskirib yotardi.
   *
   * ⚠️ TICK TEZ (6 soat), MUDDAT UZOQ (3 kun): shu ikkisi
   * ajratilgani uchun server deploy paytida yiqilib ko'tarilsa
   * ham, keyingi tickda muddati kelgan ro'yxat o'z vaqtida
   * yangilanadi.
   *
   * ⚠️ XATO BERGAN RO'YXAT 3 KUN KUTMAYDI: nosozlikda ham
   * `lastFetchedAt` yoziladi (`refreshOne` dagi `catch`), ya'ni
   * muddat bo'yicha filtrlansa, bir martalik tarmoq uzilishi
   * himoyani UCH KUNGA eskirtirib qo'yardi. Shuning uchun
   * `lastError` bor ro'yxat keyingi tickda QAYTA uriniladi.
   *
   * ⚠️ SERVER KO'TARILGANDA DARHOL ISHLAMAYDI: deploy paytida bir
   * vaqtning o'zida bir necha nusxa ko'tarilsa, hammasi birdan
   * manbalarga urilardi. Birinchi yangilash cron bilan keladi;
   * bazadagi eski ro'yxat esa o'z joyida turadi.
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async refreshAll(): Promise<void> {
    const feeds = await this.prisma.threatFeed.findMany({
      where: { isEnabled: true },
      select: { id: true, name: true, lastFetchedAt: true, lastError: true },
    });

    const now = Date.now();

    const due = feeds.filter((feed) => {
      // Hali bir marta ham yuklanmagan — darhol.
      if (!feed.lastFetchedAt) return true;

      // Oxirgi urinish xato bergan — muddat kutilmaydi.
      if (feed.lastError) return true;

      return now - feed.lastFetchedAt.getTime() >= REFRESH_INTERVAL_MS;
    });

    if (due.length === 0) return;

    for (const feed of due) {
      // ⚠️ KETMA-KET: bir vaqtda beshta 10 MB li faylni yuklash
      // konteyner xotirasini to'ldirib qo'yardi.
      await this.refreshOne(feed.id).catch((error: Error) => {
        this.logger.warn(`${feed.name}: ${error.message}`);
      });
    }

    this.invalidate();
  }

  /**
   * BITTA RO'YXATNI YANGILAYDI.
   *
   * ⚠️ XATO YOZIB QO'YILADI, YUTILMAYDI: ro'yxat bir hafta
   * yuklanmay turgan bo'lsa, panel buni KO'RSATISHI kerak — aks
   * holda himoya eskirib ketganini hech kim sezmasdi.
   *
   * ⚠️ ESKI HOSTLAR XATODA O'CHIRILMAYDI: manba vaqtincha
   * yiqilganda qora ro'yxat BO'SHAB qolardi va o'sha paytda hamma
   * firibgar domen o'tib ketardi. Yangilash faqat MUVAFFAQIYATLI
   * yuklashda almashtiriladi.
   */
  async refreshOne(id: string): Promise<{ count: number }> {
    const feed = await this.prisma.threatFeed.findUnique({ where: { id } });
    if (!feed) throw new NotFoundException("Ro'yxat topilmadi");

    let hosts: string[];

    try {
      const response = await fetch(feed.url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": "e-murojaat-guard/1.0" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      hosts = parseFeed(await response.text(), feed.format);
    } catch (error) {
      const message = (error as Error).message.slice(0, 300);

      await this.prisma.threatFeed.update({
        where: { id },
        data: { lastFetchedAt: new Date(), lastError: message },
      });

      /**
       * ⚠️ `502`, `500` EMAS: xato BIZDA emas, TASHQI manbada
       * (manzil ko'chgan, sayt yiqilgan, kalit talab qila
       * boshlagan). `500` panelda "Serverda kutilmagan xato" bo'lib
       * ko'rinardi va ma'muriyat o'z tizimini ayblab, sababini
       * boshqa joydan izlardi.
       */
      throw new BadGatewayException(`Manba javob bermadi: ${message}`);
    }

    /**
     * ⚠️ BO'SH NATIJA — XATO DEB QARALADI. Manba formatini
     * o'zgartirgan bo'lsa (CSV → JSON), tahlilchi 0 ta host
     * qaytaradi va eski ro'yxatni o'chirish himoyani JIMGINA
     * o'chirardi.
     */
    if (hosts.length === 0) {
      await this.prisma.threatFeed.update({
        where: { id },
        data: {
          lastFetchedAt: new Date(),
          lastError: "Ro'yxat bo'sh — manba formati o'zgargan bo'lishi mumkin",
        },
      });
      throw new BadGatewayException(
        "Ro'yxat bo'sh — manba formati o'zgargan bo'lishi mumkin",
      );
    }

    /**
     * ⚠️ ALMASHTIRISH TRANZAKSIYADA: o'chirish bilan yozish orasida
     * bot ro'yxat so'rasa, u YARIM ro'yxatni olardi.
     */
    await this.prisma.$transaction([
      this.prisma.threatHost.deleteMany({ where: { feedId: id } }),
      this.prisma.threatHost.createMany({
        data: hosts.map((host) => ({ feedId: id, host })),
        skipDuplicates: true,
      }),
      this.prisma.threatFeed.update({
        where: { id },
        data: {
          lastFetchedAt: new Date(),
          lastCount: hosts.length,
          lastError: null,
        },
      }),
    ]);

    this.logger.log(`${feed.name}: ${hosts.length} host`);
    this.invalidate();

    return { count: hosts.length };
  }

  /** Keshni bekor qiladi — keyingi so'rovda bazadan qayta yig'iladi. */
  private invalidate(): void {
    this.cache = null;
  }

  // ═══════════════════════════════════════════════════════════════
  //  BOT TOMONI
  // ═══════════════════════════════════════════════════════════════

  /**
   * BOTGA BERILADIGAN RO'YXAT.
   *
   * ⚠️ `since` BILAN SOLISHTIRILADI: bot oxirgi olgan versiyasini
   * yuboradi va u o'zgarmagan bo'lsa, ro'yxat QAYTA YUBORILMAYDI.
   * 50 000 hostni har soatda bekorga tashish tarmoqni band qilardi.
   *
   * ⚠️ `distinct`: bir domen bir necha ro'yxatda bo'lishi mumkin va
   * botga ikki marta yuborish ma'nosiz.
   */
  async blocklist(since?: string): Promise<{
    version: string;
    changed: boolean;
    hosts: string[];
  }> {
    if (!this.cache) {
      const [rows, total, feeds] = await Promise.all([
        this.prisma.threatHost.findMany({
          where: { feed: { isEnabled: true } },
          select: { host: true },
          distinct: ["host"],
          /**
           * {W} UMUMIY CHEGARA, HAR RO'YXAT UCHUN EMAS
           * (`MAX_BLOCKLIST_HOSTS` izohi): avval bu yerda
           * `MAX_HOSTS_PER_FEED` turardi va bitta ro'yxat
           * qolganlarini siqib chiqarardi.
           *
           * {W} TARTIB ANIQ (`host: "asc"`): chegaraga urilganda
           * qaysi hostlar tushib qolgani TASODIFIY bo'lmasligi
           * kerak — aks holda "kecha bloklangan domen bugun
           * o'tib ketdi" degan holatni tushuntirib bo'lmasdi.
           */
          orderBy: { host: "asc" },
          take: MAX_BLOCKLIST_HOSTS,
        }),
        // {W} HAQIQIY SON O'QILADI: chegaraga urilganini BILISH
        // uchun — usiz qisqartirish jimgina sodir bo'lardi.
        this.prisma.threatHost.count({ where: { feed: { isEnabled: true } } }),
        this.prisma.threatFeed.findMany({
          where: { isEnabled: true },
          select: { id: true, lastFetchedAt: true, lastCount: true },
          orderBy: { id: "asc" },
        }),
      ]);

      /**
       * ⚠️ VERSIYA — RO'YXATLAR HOLATIDAN HISOBLANADI, tasodifiy
       * son emas: server qayta ishga tushganda versiya O'ZGARMASLIGI
       * kerak, aks holda har deploy'da hamma bot ro'yxatni qaytadan
       * yuklab olardi.
       */
      const version = feeds
        .map((feed) => `${feed.id}:${feed.lastFetchedAt?.getTime() ?? 0}:${feed.lastCount}`)
        .join("|");

      /**
       * ⚠️ QISQARTIRISH JIM EMAS: himoyaning bir qismi
       * ishlamayotganini KO'RSATISH kerak. Jim qisqartirish —
       * "bo'sh natija xato" doktrinasi bilan ayni xavf: qora
       * ro'yxat yarim bo'lib qoladi va buni hech kim sezmaydi.
       *
       * ⚠️ `error`, `warn` EMAS: bu holat ma'muriyat
       * ARALASHUVINI talab qiladi (ro'yxatni o'chirish yoki
       * chegarani oshirish), ya'ni oddiy ogohlantirish emas.
       */
      if (total > MAX_BLOCKLIST_HOSTS) {
        this.logger.error(
          `Qora ro'yxat qisqartirildi: ${total} hostdan faqat ` +
            `${MAX_BLOCKLIST_HOSTS} tasi botga yuborilyapti. ` +
            `Bir nechta tashqi ro'yxatni o'chiring yoki ` +
            `MAX_BLOCKLIST_HOSTS ni oshiring.`,
        );
      }

      this.cache = { version, hosts: rows.map((row) => row.host) };
    }

    if (since && since === this.cache.version) {
      return { version: this.cache.version, changed: false, hosts: [] };
    }

    return { version: this.cache.version, changed: true, hosts: this.cache.hosts };
  }

  // ═══════════════════════════════════════════════════════════════
  //  PANEL TOMONI
  // ═══════════════════════════════════════════════════════════════

  async list() {
    const feeds = await this.prisma.threatFeed.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        url: true,
        format: true,
        isEnabled: true,
        lastFetchedAt: true,
        lastCount: true,
        lastError: true,
      },
    });

    return feeds;
  }

  async setEnabled(id: string, isEnabled: boolean, userId: string) {
    const feed = await this.prisma.threatFeed.findUnique({ where: { id } });
    if (!feed) throw new NotFoundException("Ro'yxat topilmadi");

    await this.prisma.threatFeed.update({ where: { id }, data: { isEnabled } });
    this.invalidate();

    await this.audit.record({
      userId,
      action: isEnabled ? "threat_feed.enable" : "threat_feed.disable",
      entity: "ThreatFeed",
      entityId: id,
      meta: { name: feed.name },
    });

    return { ok: true };
  }

  /**
   * QO'LDA YANGILASH.
   *
   * ⚠️ KERAK, CHUNKI CRON 6 SOATDA: yangi ro'yxat qo'shilganda yoki
   * xato tuzatilganda ma'muriyat natijani DARHOL ko'rishi kerak —
   * aks holda "ishladimi yoki yo'qmi" degan savol olti soat ochiq
   * qolardi.
   */
  async refresh(id: string, userId: string) {
    const feed = await this.prisma.threatFeed.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!feed) throw new NotFoundException("Ro'yxat topilmadi");

    await this.audit.record({
      userId,
      action: "threat_feed.refresh",
      entity: "ThreatFeed",
      entityId: id,
      meta: { name: feed.name },
    });

    /**
     * ⚠️ KUTILMAYDI (`void`), VA BU TIRIK O'LCHOVDAN: GitHub'dagi
     * fishing ro'yxati 3,7 MB va sekin tarmoqda u UCH DAQIQA
     * yuklanadi. HTTP so'rovi buni kutib turolmaydi — nginx ham,
     * brauzer ham uzib qo'yadi va xodim "ishlamadi" deb o'ylardi,
     * holbuki yuklash davom etayotgan bo'lardi.
     *
     * ⚠️ NATIJA RO'YXATNING O'ZIDA KO'RINADI: `lastCount`,
     * `lastFetchedAt` va `lastError` yangilanadi, panel esa ro'yxatni
     * qayta so'rab turadi — tarqatma (`broadcasts`) bilan ayni
     * yondashuv.
     */
    void this.refreshOne(id).catch((error: Error) => {
      this.logger.warn(`${feed.name}: ${error.message}`);
    });

    return { started: true as const };
  }
}

// ═══════════════════════════════════════════════════════════════════
//  TAHLIL — SOF FUNKSIYALAR
// ═══════════════════════════════════════════════════════════════════

/**
 * ⚠️ SHAKL QO'LDA TANLANADI, AVTOMATIK ANIQLANMAYDI: manba bir kun
 * formatini o'zgartirsa, avtomatik aniqlash JIMGINA noto'g'ri
 * tahlilga o'tib, ro'yxat bo'shab qolardi — himoya esa o'chgandek
 * bo'lardi. Bo'sh natija esa yuqorida XATO deb qaraladi.
 */
export const parseFeed = (text: string, format: ThreatFeedFormat): string[] => {
  const out = new Set<string>();

  for (const raw of text.split("\n")) {
    if (out.size >= MAX_HOSTS_PER_FEED) break;

    const line = raw.trim();
    // ⚠️ IZOHLAR VA BO'SH QATORLAR: har ro'yxatda ular bor.
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;

    const host = extractHost(line, format);
    if (!host) continue;
    if (SKIP_HOSTS.has(host)) continue;

    /**
     * ⚠️ FAQAT DOMENGA O'XSHAGANI OLINADI: nuqtasiz satr ("evil")
     * yoki bo'shliqli matn ro'yxatga tushsa, `hostMatches`
     * tekshiruvi tasodifiy mos kelib qolishi mumkin edi.
     */
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) continue;

    out.add(host);
  }

  return [...out];
};

const extractHost = (line: string, format: ThreatFeedFormat): string | null => {
  switch (format) {
    /**
     * `0.0.0.0 evil.com` yoki `127.0.0.1 evil.com` — StevenBlack,
     * AdGuard DNS va shunga o'xshash `hosts` fayllari.
     */
    case ThreatFeedFormat.hosts: {
      const parts = line.split(/\s+/);
      const candidate = parts.length > 1 ? parts[1] : parts[0];
      return candidate ? normalizeHost(candidate) : null;
    }

    /**
     * `||evil.com^` — AdGuard filtr sintaksisi.
     *
     * ⚠️ ISTISNO QOIDALARI (`@@`) O'TKAZIB YUBORILADI: ular
     * "bu domenni bloklama" degani va ro'yxatga qo'shilsa, teskari
     * natija berardi.
     *
     * ⚠️ MURAKKAB QOIDALAR (`$`, `/`, `*`) HAM O'TKAZILADI: ular
     * yo'l yoki parametr bo'yicha ishlaydi va bizda faqat HOST
     * darajasidagi tekshiruv bor.
     */
    case ThreatFeedFormat.adguard: {
      if (line.startsWith("@@")) return null;
      if (line.includes("$") || line.includes("/") || line.includes("*")) return null;

      const match = /^\|\|([a-z0-9.-]+)\^?$/i.exec(line);
      return match?.[1] ? normalizeHost(match[1]) : null;
    }

    /**
     * URLhaus — to'liq havola (matn ro'yxati yoki CSV maydoni).
     *
     * ⚠️ CSV DA HAVOLA QAYSI USTUNDA EKANI O'ZGARISHI MUMKIN,
     * shuning uchun ustun raqami bo'yicha emas, `http` bilan
     * BOSHLANGAN birinchi bo'lak bo'yicha topiladi.
     */
    case ThreatFeedFormat.urlhaus: {
      const field = line
        .split(",")
        .map((part) => part.trim().replace(/^"|"$/g, ""))
        .find((part) => /^https?:\/\//i.test(part));

      const url = field ?? (/^https?:\/\//i.test(line) ? line : null);
      if (!url) return null;

      try {
        return normalizeHost(new URL(url).hostname);
      } catch {
        return null;
      }
    }

    /** Har qatorda bitta domen — PhishTank/OpenPhish domen eksporti. */
    case ThreatFeedFormat.domains:
    default: {
      // ⚠️ Ba'zi ro'yxatlarda domen yonida izoh bo'ladi.
      const candidate = line.split(/[\s,;]/)[0];
      return candidate ? normalizeHost(candidate) : null;
    }
  }
};
