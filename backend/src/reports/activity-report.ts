import type { ActivityStatus } from "@prisma/client";
import { STATUS_META } from "../activities/activity-status";
import {
  PAGE,
  REPORT_COLORS,
  createReportChrome,
  formatDate,
  formatDuration,
  formatTime,
  truncate,
} from "./report-layout";

export type ReportActivity = {
  status: ActivityStatus;
  detail: string;
  /** Snapshot del titulo de la tarea declarada, si hubo alguna. */
  taskTitle?: string | null;
  startedAt: Date;
  endedAt: Date | null;
  employee: {
    employeeNumber: number;
    name: string;
  };
};

/**
 * Que va en la columna DETALLE. El comentario dejo de ser obligatorio en
 * WORKING cuando se pudo declarar la tarea: sin este fallback, la columna
 * quedaria vacia justo en el estado que mas importa del reporte.
 */
function detailText(row: ReportActivity) {
  if (row.detail && row.taskTitle) return `${row.taskTitle} - ${row.detail}`;
  return row.detail || row.taskTitle || "";
}

type ReportOptions = {
  title: string;
  subtitle: string;
  periodLabel: string;
  rows: ReportActivity[];
  generatedAt?: Date;
};

const COLORS = REPORT_COLORS;
const STATUS = STATUS_META;

/** Los tramos abiertos (endedAt null) se cuentan hasta la generacion. */
function durationMs(row: ReportActivity, generatedAt: Date) {
  return Math.max(0, (row.endedAt ?? generatedAt).getTime() - row.startedAt.getTime());
}

export function renderActivityReport(doc: any, options: ReportOptions) {
  const generatedAt = options.generatedAt ?? new Date();
  const { width: pageWidth, margin, contentWidth } = PAGE;

  const employeeCount = new Set(options.rows.map((row) => row.employee.employeeNumber)).size;
  const totalDuration = options.rows.reduce((total, row) => total + durationMs(row, generatedAt), 0);

  const chrome = createReportChrome(doc, {
    title: options.title,
    subtitle: options.subtitle,
    periodLabel: options.periodLabel,
    footerLabel: "Status Manager - Registro de actividades",
    continuationTitle: "Continuacion del registro",
    generatedAt,
  });

  const drawTableHeader = () => {
    doc.roundedRect(margin, chrome.y, contentWidth, 24, 5).fill(COLORS.ink);
    doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(7.5);
    doc.text("EMPLEADO", margin + 10, chrome.y + 8, { width: 105 });
    doc.text("ESTADO", margin + 120, chrome.y + 8, { width: 78 });
    doc.text("INICIO", margin + 203, chrome.y + 8, { width: 72 });
    doc.text("DURACION", margin + 280, chrome.y + 8, { width: 62 });
    doc.text("DETALLE", margin + 347, chrome.y + 8, { width: 154 });
    chrome.y += 30;
  };

  chrome.drawCover();

  chrome.drawKpiCards([
    { label: "REGISTROS", value: String(options.rows.length) },
    { label: "EMPLEADOS", value: String(employeeCount) },
    { label: "TIEMPO REGISTRADO", value: formatDuration(totalDuration), highlight: true },
  ]);

  chrome.drawSectionTitle(
    "Detalle de actividades",
    "Los estados abiertos se calculan hasta la generacion del reporte. No se incluyen los periodos Desconectado."
  );
  drawTableHeader();

  if (options.rows.length === 0) {
    chrome.drawEmptyState("No hay actividades registradas para el periodo seleccionado.");
  }

  options.rows.forEach((row, index) => {
    const rowHeight = 48;
    chrome.ensureRoom(rowHeight, drawTableHeader);

    const background = index % 2 === 0 ? COLORS.white : "#FAFAFD";
    doc.roundedRect(margin, chrome.y, contentWidth, rowHeight - 4, 5).fill(background);
    doc
      .moveTo(margin, chrome.y + rowHeight - 4)
      .lineTo(pageWidth - margin, chrome.y + rowHeight - 4)
      .lineWidth(0.5)
      .stroke(COLORS.line);

    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8.5);
    doc.text(truncate(row.employee.name, 24), margin + 10, chrome.y + 10, { width: 105 });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7);
    doc.text(`#${row.employee.employeeNumber}`, margin + 10, chrome.y + 25, { width: 105 });

    const status = STATUS[row.status];
    doc.roundedRect(margin + 120, chrome.y + 10, 76, 20, 6).fill(status.pale);
    doc.fillColor(status.color).font("Helvetica-Bold").fontSize(7);
    doc.text(status.label.toUpperCase(), margin + 126, chrome.y + 17, { width: 64, align: "center" });

    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(7.5);
    doc.text(formatDate(row.startedAt), margin + 203, chrome.y + 10, { width: 72 });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7);
    doc.text(formatTime(row.startedAt), margin + 203, chrome.y + 24, { width: 72 });

    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8);
    doc.text(formatDuration(durationMs(row, generatedAt)), margin + 280, chrome.y + 16, { width: 62 });

    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5);
    doc.text(truncate(detailText(row), 92), margin + 347, chrome.y + 9, {
      width: 154,
      height: 31,
      ellipsis: true,
    });

    chrome.y += rowHeight;
  });

  chrome.drawFooter();
  doc.end();
}
