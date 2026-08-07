/**
 * Chrome compartido por los reportes PDF: banda de marca, bloque de periodo,
 * tarjetas de resumen, titulo de seccion, estado vacio, footer y salto de
 * pagina. El cuerpo de la tabla NO vive aca: cada reporte tiene sus propias
 * columnas y las dibuja usando `chrome.y` como cursor vertical.
 *
 * `doc` va tipado `any` porque asi esta declarado pdfkit en este proyecto
 * (ver backend/src/pdfkit.d.ts).
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
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatTime(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
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
  /** Pinta el valor en violeta en vez de negro. Una sola por reporte. */
  highlight?: boolean;
};

export type ReportChromeOptions = {
  title: string;
  subtitle: string;
  periodLabel: string;
  /** Texto del pie de pagina, a la izquierda del numero de pagina. */
  footerLabel: string;
  /** Titulo de las paginas 2+. */
  continuationTitle: string;
  generatedAt: Date;
};

export type ReportChrome = {
  /** Cursor vertical. Cada reporte lo avanza al dibujar sus propias filas. */
  y: number;
  /** Banda de marca + bloque PERIODO + "Generado el". Deja y = 195. */
  drawCover(): void;
  /** Fila de 3 tarjetas de resumen. Avanza y += 78. */
  drawKpiCards(cards: KpiCard[]): void;
  /** Titulo 14pt + nota 8pt opcional. Avanza y += 42. */
  drawSectionTitle(title: string, note?: string): void;
  /** Caja gris con mensaje centrado. Avanza y += 82. */
  drawEmptyState(message: string): void;
  drawFooter(): void;
  /**
   * Si la fila no entra en lo que queda de pagina, cierra la actual, abre otra
   * y vuelve a dibujar la cabecera de tabla que le pasan. Devuelve true si
   * hubo salto.
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
      doc.text("PERIODO DEL REPORTE", margin, chrome.y, { characterSpacing: 0.8 });
      doc.fillColor(REPORT_COLORS.ink).font("Helvetica-Bold").fontSize(11);
      doc.text(options.periodLabel, margin, chrome.y + 12, { width: contentWidth - 180 });
      doc.fillColor(REPORT_COLORS.muted).font("Helvetica").fontSize(8);
      doc.text(
        `Generado el ${formatDate(options.generatedAt)} a las ${formatTime(options.generatedAt)}`,
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
      doc.text(`Pagina ${pageNumber}`, width - margin - 90, footerY, {
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
