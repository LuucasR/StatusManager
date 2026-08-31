import { LOCALE } from "../locale";

/**
 * Chrome shared by the PDF reports: brand band, period block, summary cards,
 * section title, empty state, footer and page break. The table body does NOT
 * live here: each report has its own columns and draws them using `chrome.y`
 * as the vertical cursor.
 *
 * `doc` is typed `any` because that is how pdfkit is declared in this project
 * (see backend/src/pdfkit.d.ts).
 */

export const REPORT_COLORS = {
  ink: "#17182F",
  muted: "#6D7087",
  line: "#E8E9F1",
  surface: "#F6F7FB",
  primary: "#5B5CE2",
  primaryDark: "#4546BA",
  white: "#FFFFFF",
} as const;

export const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 42,
  contentWidth: 595.28 - 42 * 2, // 511.28
} as const;

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatTime(date: Date) {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDuration(milliseconds: number) {
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${String(minutes).padStart(2, "0")} min`;
}

export function truncate(value: string, maxLength: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 1)}...`;
}

export type KpiCard = {
  label: string;
  value: string;
  /** Paints the value violet instead of black. One per report only. */
  highlight?: boolean;
};

export type ReportChromeOptions = {
  title: string;
  subtitle: string;
  periodLabel: string;
  /** Footer text, to the left of the page number. */
  footerLabel: string;
  /** Title used on page 2 onwards. */
  continuationTitle: string;
  generatedAt: Date;
};

export type ReportChrome = {
  /** Vertical cursor. Each report advances it as it draws its own rows. */
  y: number;
  /** Brand band + PERIOD block + "Generated on". Leaves y = 195. */
  drawCover(): void;
  /** Row of 3 summary cards. Advances y += 78. */
  drawKpiCards(cards: KpiCard[]): void;
  /** 14pt title + optional 8pt note. Advances y += 42. */
  drawSectionTitle(title: string, note?: string): void;
  /** Grey box with a centred message. Advances y += 82. */
  drawEmptyState(message: string): void;
  drawFooter(): void;
  /**
   * If the row does not fit in what is left of the page, closes the current one,
   * opens another and redraws the table header it is handed. Returns true when a
   * break happened.
   */
  ensureRoom(rowHeight: number, drawTableHeader: () => void): boolean;
};

export function createReportChrome(doc: any, options: ReportChromeOptions): ReportChrome {
  const { width, height, margin, contentWidth } = PAGE;
  let pageNumber = 1;

  const chrome: ReportChrome = {
    y: 0,

    drawCover() {
      doc.save();
      doc.rect(0, 0, width, 128).fill(REPORT_COLORS.primary);
      doc.rect(0, 108, width, 20).fill(REPORT_COLORS.primaryDark);

      doc.circle(margin + 18, 38, 18).fill(REPORT_COLORS.white);
      doc.fillColor(REPORT_COLORS.primary).font("Helvetica-Bold").fontSize(11);
      doc.text("SM", margin + 7, 34, { width: 22, align: "center" });

      doc.fillColor(REPORT_COLORS.white).font("Helvetica-Bold").fontSize(9);
      doc.text("STATUS MANAGER", margin + 48, 25, { characterSpacing: 1.4 });
      doc.font("Helvetica-Bold").fontSize(23);
      doc.text(options.title, margin + 48, 43, { width: contentWidth - 48 });
      doc.font("Helvetica").fontSize(9.5).fillColor("#E7E7FF");
      doc.text(options.subtitle, margin + 48, 76, { width: contentWidth - 48 });
      doc.restore();

      chrome.y = 150;

      doc.fillColor(REPORT_COLORS.muted).font("Helvetica-Bold").fontSize(7.5);
      doc.text("REPORT PERIOD", margin, chrome.y, { characterSpacing: 0.8 });
      doc.fillColor(REPORT_COLORS.ink).font("Helvetica-Bold").fontSize(11);
      doc.text(options.periodLabel, margin, chrome.y + 12, { width: contentWidth - 180 });
      doc.fillColor(REPORT_COLORS.muted).font("Helvetica").fontSize(8);
      doc.text(
        `Generated on ${formatDate(options.generatedAt)} at ${formatTime(options.generatedAt)}`,
        width - margin - 190,
        chrome.y + 4,
        { width: 190, align: "right" }
      );
      chrome.y += 45;
    },

    drawKpiCards(cards) {
      const cardGap = 10;
      const cardWidth = (contentWidth - cardGap * 2) / 3;
      cards.forEach((card, index) => {
        const x = margin + index * (cardWidth + cardGap);
        doc.roundedRect(x, chrome.y, cardWidth, 58, 8).fill(REPORT_COLORS.surface);
        doc.fillColor(REPORT_COLORS.muted).font("Helvetica-Bold").fontSize(7);
        doc.text(card.label, x + 12, chrome.y + 12, {
          width: cardWidth - 24,
          characterSpacing: 0.6,
        });
        doc
          .fillColor(card.highlight ? REPORT_COLORS.primary : REPORT_COLORS.ink)
          .font("Helvetica-Bold")
          .fontSize(16);
        doc.text(card.value, x + 12, chrome.y + 29, { width: cardWidth - 24 });
      });
      chrome.y += 78;
    },

    drawSectionTitle(title, note) {
      doc.fillColor(REPORT_COLORS.ink).font("Helvetica-Bold").fontSize(14);
      doc.text(title, margin, chrome.y);
      if (note) {
        doc.fillColor(REPORT_COLORS.muted).font("Helvetica").fontSize(8);
        doc.text(note, margin, chrome.y + 19, { width: contentWidth });
      }
      chrome.y += 42;
    },

    drawEmptyState(message) {
      doc.roundedRect(margin, chrome.y, contentWidth, 72, 8).fill(REPORT_COLORS.surface);
      doc.fillColor(REPORT_COLORS.muted).font("Helvetica").fontSize(10);
      doc.text(message, margin + 20, chrome.y + 29, {
        width: contentWidth - 40,
        align: "center",
      });
      chrome.y += 82;
    },

    drawFooter() {
      const footerY = height - 34;
      doc
        .moveTo(margin, footerY - 8)
        .lineTo(width - margin, footerY - 8)
        .lineWidth(0.7)
        .stroke(REPORT_COLORS.line);
      doc.fillColor(REPORT_COLORS.muted).font("Helvetica").fontSize(7.5);
      doc.text(options.footerLabel, margin, footerY, { width: 280 });
      doc.text(`Page ${pageNumber}`, width - margin - 90, footerY, {
        width: 90,
        align: "right",
      });
    },

    ensureRoom(rowHeight, drawTableHeader) {
      if (chrome.y + rowHeight <= height - 54) return false;

      chrome.drawFooter();
      doc.addPage();
      pageNumber += 1;
      chrome.y = 42;
      doc.fillColor(REPORT_COLORS.primary).font("Helvetica-Bold").fontSize(8);
      doc.text("STATUS MANAGER", margin, chrome.y, { characterSpacing: 1.2 });
      chrome.y += 19;
      doc.fillColor(REPORT_COLORS.ink).font("Helvetica-Bold").fontSize(12);
      doc.text(options.continuationTitle, margin, chrome.y);
      chrome.y += 24;
      drawTableHeader();
      return true;
    },
  };

  return chrome;
}
