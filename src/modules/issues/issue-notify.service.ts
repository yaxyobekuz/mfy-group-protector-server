/**
 * MUALLIFGA XABAR — muammo javobi botga qaytadi.
 *
 * ⚠️ SERVER TELEGRAM'GA TO'G'RIDAN-TO'G'RI MUROJAAT QILADI, bot
 * orqali emas. Sabab: bot `polling` bilan ishlaydi va unga
 * "shu xabarni yubor" deb buyruq berish uchun unda HTTP server
 * ko'tarish kerak bo'lardi — ya'ni ikkinchi API. Telegram'ning
 * `sendMessage` metodi esa oddiy HTTP so'rov va uni ikki tomon ham
 * chaqira oladi.
 *
 * ⚠️ YUBORISHNING O'ZI — `common/telegram.ts`, YAGONA MANBA. Bu
 * faylda avval o'z `fetch` nusxasi turardi va u yagona manbadan
 * JIMGINA ajralib ketgan edi: `AbortSignal.timeout` qo'shilgani bu
 * yerga yetib kelmagan, ya'ni javobsiz so'rov murojaat yopilishini
 * muzlatib qo'yishi mumkin edi. Bu yerda faqat MATN yasaladi.
 *
 * ⚠️ XATO YUQORIGA CHIQMAYDI. "Muammo yopildi, lekin xabar
 * yuborilmadi" holati "muammo umuman yopilmadi" dan YAXSHI: javob
 * panelda ko'rinib turadi va kerak bo'lsa qo'lda aytiladi. Shuning
 * uchun har metod `catch` bilan tugaydi.
 *
 * ⚠️ `parse_mode: "HTML"` — shuning uchun `escapeHtml` MAJBURIY.
 * Aholi yozgan matnda `<` yoki `&` bo'lsa (masalan "narx < 100000"),
 * Telegram butun xabarni RAD ETADI (400) va javob hech qachon
 * yetib bormasdi.
 */

import { Injectable, Logger } from "@nestjs/common";

import { formatDateTimeUz } from "../../common/date.util";
import { escapeHtml, sendMessage } from "../../common/telegram";

@Injectable()
export class IssueNotifyService {
  private readonly logger = new Logger(IssueNotifyService.name);

  /** Muammo yopildi — muallifga javob. */
  async sendResolution(input: {
    chatId: string | null;
    publicNo: string;
    title: string;
    resolution: string;
    rejected: boolean;
  }): Promise<void> {
    // ⚠️ `chatId` BO'SH — NORMAL HOL: signaldan kelgan muammoda u
    // ataylab to'ldirilmaydi (javob MFY guruhiga ketmasligi kerak).
    if (!input.chatId) return;

    const heading = input.rejected
      ? "❌ <b>Murojaatingiz rad etildi</b>"
      : "✅ <b>Murojaatingiz hal qilindi</b>";

    const text = [
      heading,
      "",
      `<b>Raqam:</b> ${this.escapeHtml(input.publicNo)}`,
      `<b>Mavzu:</b> ${this.escapeHtml(input.title)}`,
      "",
      "<b>Javob:</b>",
      this.escapeHtml(input.resolution),
    ].join("\n");

    await this.send(input.chatId, text);
  }

  /** Ommaviy izoh — muallifga. */
  async sendComment(input: {
    chatId: string;
    publicNo: string;
    body: string;
  }): Promise<void> {
    const text = [
      `💬 <b>${this.escapeHtml(input.publicNo)}</b> bo'yicha yangi xabar:`,
      "",
      this.escapeHtml(input.body),
    ].join("\n");

    await this.send(input.chatId, text);
  }

  /**
   * YUQORI JIDDIYLIKDAGI SIGNAL — mas'ul chatlarga.
   *
   * ⚠️ BU SIGNAL, MUAMMO EMAS: xabar matni ham shuni aytadi
   * ("tekshirib ko'rish kerak"), aks holda mas'ul odam uni rasmiy
   * murojaat deb qabul qilib, panelga kirmay javob berib qo'yardi.
   */
  async sendSignalAlert(input: {
    chatIds: string[];
    groupTitle: string;
    mahallaName: string | null;
    summary: string;
    messageLink: string | null;
  }): Promise<void> {
    if (input.chatIds.length === 0) return;

    const lines = [
      "🔴 <b>Yuqori jiddiylikdagi signal</b>",
      "",
      `<b>Guruh:</b> ${this.escapeHtml(input.groupTitle)}`,
    ];

    if (input.mahallaName) {
      lines.push(`<b>MFY:</b> ${this.escapeHtml(input.mahallaName)}`);
    }

    lines.push("", this.escapeHtml(input.summary));

    if (input.messageLink) {
      lines.push("", `<a href="${input.messageLink}">Xabarni ochish</a>`);
    }

    lines.push("", "<i>Bu — AI taxmini. Panelda ko'rib chiqing.</i>");

    const text = lines.join("\n");

    // ⚠️ KETMA-KET YUBORILADI, parallel emas: Telegram bitta botdan
    // sekundda ~30 xabarni o'tkazadi va parallel yuborish 429
    // (Too Many Requests) berardi.
    for (const chatId of input.chatIds) {
      await this.send(chatId, text);
    }
  }

  /**
   * YANGI MUROJAAT TASHKILOTGA YO'NALTIRILDI.
   *
   * ⚠️ BU XABARNOMA, TOPSHIRIQ EMAS — va matn ham shuni aytadi.
   * Rasmiy javobni (fuqaroga ketadigan matnni) shtab xodimi yozadi;
   * tashkilot ishni bajarib, panelda "Bajarildi" deb belgilaydi
   * (`POST /issues/:id/org-done`). Matnda "javob bering" deyilsa,
   * tashkilot fuqaroga o'zidan yozib, ikki xil javob paydo bo'lardi.
   *
   * ⚠️ FUQARONING ISMI VA TELEFONI YUBORILMAYDI: Telegram chati
   * tashkilotning ish guruhi bo'lishi mumkin va u yerda o'nlab odam
   * bor. Murojaat raqami bilan xodim panelda hamma ma'lumotni
   * ko'radi — ya'ni ma'lumot yo'qolmaydi, shunchaki chatga
   * tarqatilmaydi.
   *
   * ⚠️ XATO YUQORIGA CHIQMAYDI (fayl boshidagi doktrina): "murojaat
   * yaratildi, lekin xabar ketmadi" holati "murojaat umuman
   * yaratilmadi" dan YAXSHI — murojaat panelda turadi va kerak
   * bo'lsa qo'lda aytiladi.
   */
  async sendOrgAssignment(input: {
    chatIds: string[];
    publicNo: string;
    categoryName: string;
    mahallaName: string | null;
    districtName: string | null;
    address: string | null;
    body: string;
    dueAt: Date | null;
  }): Promise<void> {
    if (input.chatIds.length === 0) return;

    const lines = [
      "📬 <b>Yangi murojaat yo'naltirildi</b>",
      "",
      `<b>Raqam:</b> ${this.escapeHtml(input.publicNo)}`,
      `<b>Yo'nalish:</b> ${this.escapeHtml(input.categoryName)}`,
    ];

    /**
     * ⚠️ HUDUD BO'SH BO'LISHI MUMKIN VA BU XATO EMAS: fuqaro
     * profilida MFY ko'rsatmagan bo'lsa, murojaat hududsiz keladi
     * (`mobile.service.ts#create`). O'shanda qator UMUMAN
     * yozilmaydi — "Hudud: Belgilanmagan" degan qator tashkilotga
     * hech narsa bermasdi.
     */
    const place = [input.districtName, input.mahallaName].filter(Boolean).join(", ");
    if (place) lines.push(`<b>Hudud:</b> ${this.escapeHtml(place)}`);
    if (input.address) lines.push(`<b>Manzil:</b> ${this.escapeHtml(input.address)}`);

    /**
     * ⚠️ SANA `formatDateTimeUz` ORQALI — YAGONA MANBA
     * (`common/date.util.ts`). `toLocaleDateString` TAQIQLANGAN
     * (CLAUDE.md) va u konteynerda UTC zonasini berib, muddatni
     * besh soat oldinga ko'rsatardi.
     */
    if (input.dueAt) {
      lines.push(`<b>Muddat:</b> ${this.escapeHtml(formatDateTimeUz(input.dueAt))}`);
    }

    /**
     * ⚠️ MATN QISQARTIRILADI: murojaat 4000 belgigacha bo'lishi
     * mumkin (`CreateIssueDto`) va Telegram bitta xabarga 4096
     * belgi beradi — sarlavha qatorlari bilan birga chegaradan
     * o'tib, xabar BUTUNLAY rad etilardi (400). Chatda mazmunni
     * tushunish uchun boshi yetarli, to'lig'i esa panelda.
     */
    const text = input.body.trim();
    const preview = text.length > 700 ? `${text.slice(0, 700)}…` : text;

    lines.push("", this.escapeHtml(preview));
    lines.push("", "<i>Rasmiy javobni shtab yozadi. Ishni bajargach, panelda «Bajarildi» deb belgilang.</i>");

    const message = lines.join("\n");

    /**
     * ⚠️ KETMA-KET, PARALLEL EMAS (`sendSignalAlert` bilan ayni
     * sabab): Telegram bitta botdan sekundda ~30 xabarni
     * o'tkazadi va parallel yuborish `429` berardi.
     */
    for (const chatId of input.chatIds) {
      await this.send(chatId, message);
    }
  }

  // ───────────────────────────────────────────────────────────────

  private async send(chatId: string, text: string): Promise<void> {
    // ⚠️ TOKEN TEKSHIRUVI, TIMEOUT VA `parse_mode` — YAGONA
    // MANBADA (`common/telegram.ts`). Bu yerda faqat natija
    // jurnalga yoziladi.
    const result = await sendMessage(chatId, text);

    if (!result.ok) {
      // ⚠️ XATO YUQORIGA CHIQMAYDI — fayl boshidagi izoh:
      // "muammo yopildi, lekin xabar yetib bormadi" holati
      // "muammo umuman yopilmadi" dan yaxshi.
      this.logger.warn(`Telegram xabari yuborilmadi: ${result.description}`);
    }
  }

  /**
   * ⚠️ YAGONA MANBADAN (`common/telegram.ts#escapeHtml`): bu yerda
   * o'z nusxasi turardi va ikkisi ajralib ketsa, bir yo'lda
   * qochirilmagan `<` butun xabarni Telegram'ga RAD ETTIRARDI
   * (400) — javob esa hech qachon yetib bormasdi.
   */
  private escapeHtml(value: string): string {
    return escapeHtml(value);
  }
}
