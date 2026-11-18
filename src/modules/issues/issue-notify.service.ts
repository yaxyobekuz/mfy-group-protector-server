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

import { env } from "../../config/env.config";

const TELEGRAM_API = "https://api.telegram.org";

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

  // ───────────────────────────────────────────────────────────────

  private async send(chatId: string, text: string): Promise<void> {
    // ⚠️ TOKEN YO'Q BO'LSA JIM O'TKAZILADI: bu majburiy emas
    // (`env.config.ts`) va uning yo'qligi tizimni to'xtatmasligi
    // kerak.
    if (!env.botToken) return;

    try {
      const response = await fetch(`${TELEGRAM_API}/bot${env.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          // Havola oldi-ko'rinishi xabarni ikki barobar
          // uzaytirardi.
          link_preview_options: { is_disabled: true },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`Telegram xabari yuborilmadi (${response.status}): ${body}`);
      }
    } catch (error) {
      // ⚠️ XATO YUQORIGA CHIQMAYDI — fayl boshidagi izoh.
      this.logger.warn(`Telegram xabari yuborilmadi: ${(error as Error).message}`);
    }
  }

  /**
   * ⚠️ MAJBURIY: `parse_mode: "HTML"` bilan yuborilgan xabarda
   * `<`, `>`, `&` belgilari teg sifatida o'qiladi. Aholi yozgan
   * matnda ular bo'lishi oddiy hol ("narx < 100000", "AKFA & Co")
   * va o'shanda Telegram butun xabarni RAD ETADI (400).
   */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
