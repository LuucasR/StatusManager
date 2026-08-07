import type { TaskState } from "@prisma/client";
import { TASK_STATE_META } from "../tasks/task-state";
import {
  PAGE,
  REPORT_COLORS,
  createReportChrome,
  formatDate,
  formatDuration,
  formatTime,
  truncate,
} from "./report-layout";

export type ReportTask = {
  id: number;
  title: string;
  state: TaskState;
  startsAt: Date;
  endsAt: Date;
  pinned: boolean;
  createdBy: { name: string } | null;
  participants: { employeeNumber: number; name: string }[];
};

type TaskReportOptions = {
  title: string;
  subtitle: string;
  periodLabel: string;
  rows: ReportTask[];
  /**
   * Corte de archivado, calculado por el router. Se pasa como parametro para
   * que este modulo no dependa de las reglas de negocio de tasks/.
   */
  archiveCutoff: Date;
  generatedAt?: Date;
};

const COLORS = REPORT_COLORS;
const STATE = TASK_STATE_META;

/** Solo el primer nombre, para que entren varios participantes en 100pt. */
function shortName(name: string) {
  return truncate(name.split(" ")[0] ?? name, 12);
}

export function renderTaskReport(doc: any, options: TaskReportOptions) {
  const generatedAt = options.generatedAt ?? new Date();
  const { width: pageWidth, margin, contentWidth } = PAGE;

  const isArchived = (row: ReportTask) => !row.pinned && row.endsAt < options.archiveCutoff;

  const doneCount = options.rows.filter((row) => row.state === "DONE").length;
  const archivedCount = options.rows.filter(isArchived).length;

  const chrome = createReportChrome(doc, {
    title: options.title,
    subtitle: options.subtitle,
    periodLabel: options.periodLabel,
    footerLabel: "Status Manager - Tareas del equipo",
    continuationTitle: "Continuacion del listado",
    generatedAt,
  });

  const drawTableHeader = () => {
    doc.roundedRect(margin, chrome.y, contentWidth, 24, 5).fill(COLORS.ink);
    doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(7.5);
    doc.text("TAREA", margin + 10, chrome.y + 8, { width: 158 });
    doc.text("ESTADO", margin + 176, chrome.y + 8, { width: 78 });
    doc.text("INICIO", margin + 259, chrome.y + 8, { width: 66 });
    doc.text("FIN", margin + 330, chrome.y + 8, { width: 66 });
    doc.text("PARTICIPANTES", margin + 401, chrome.y + 8, { width: 100 });
    chrome.y += 30;
  };

  chrome.drawCover();

  chrome.drawKpiCards([
    { label: "TAREAS", value: String(options.rows.length) },
    { label: "TERMINADAS", value: `${doneCount} de ${options.rows.length}` },
    { label: "ARCHIVADAS", value: String(archivedCount), highlight: true },
  ]);

  chrome.drawSectionTitle(
    "Detalle de tareas",
    "Incluye las tareas archivadas (fondo gris): las que superaron los 14 dias desde su fecha de fin y ya no aparecen en la pizarra. La barra violeta marca las tareas fijadas, que nunca se archivan."
  );
  drawTableHeader();

  if (options.rows.length === 0) {
    chrome.drawEmptyState("No hay tareas para los filtros seleccionados.");
  }

  options.rows.forEach((row, index) => {
    const rowHeight = 48;
    chrome.ensureRoom(rowHeight, drawTableHeader);

    const archived = isArchived(row);
    // Las archivadas rompen el cebreado con el gris de superficie: se leen como
    // una banda distinta sin necesidad de leer la etiqueta.
    const background = archived ? COLORS.surface : index % 2 === 0 ? COLORS.white : "#FAFAFD";
    doc.roundedRect(margin, chrome.y, contentWidth, rowHeight - 4, 5).fill(background);
    doc
      .moveTo(margin, chrome.y + rowHeight - 4)
      .lineTo(pageWidth - margin, chrome.y + rowHeight - 4)
      .lineWidth(0.5)
      .stroke(COLORS.line);

    if (row.pinned) {
      doc.roundedRect(margin, chrome.y, 3, rowHeight - 4, 1.5).fill(COLORS.primary);
    }

    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8.5);
    doc.text(truncate(row.title, 34), margin + 10, chrome.y + 10, { width: 158 });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7);
    doc.text(
      row.createdBy ? `#${row.id} · creada por ${truncate(row.createdBy.name, 20)}` : `#${row.id}`,
      margin + 10,
      chrome.y + 25,
      { width: 158 }
    );

    const state = STATE[row.state];
    doc.roundedRect(margin + 176, chrome.y + 8, 76, 20, 6).fill(state.pale);
    doc.fillColor(state.color).font("Helvetica-Bold").fontSize(7);
    doc.text(state.label.toUpperCase(), margin + 182, chrome.y + 15, { width: 64, align: "center" });

    const marks = [row.pinned ? "FIJADA" : "", archived ? "ARCHIVADA" : ""].filter(Boolean);
    if (marks.length) {
      doc.fillColor(row.pinned ? COLORS.primary : COLORS.muted).font("Helvetica-Bold").fontSize(6.5);
      doc.text(marks.join(" · "), margin + 176, chrome.y + 32, { width: 78, align: "center" });
    }

    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(7.5);
    doc.text(formatDate(row.startsAt), margin + 259, chrome.y + 10, { width: 66 });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7);
    doc.text(formatTime(row.startsAt), margin + 259, chrome.y + 24, { width: 66 });

    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(7.5);
    doc.text(formatDate(row.endsAt), margin + 330, chrome.y + 10, { width: 66 });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7);
    doc.text(
      `${formatTime(row.endsAt)} · ${formatDuration(row.endsAt.getTime() - row.startsAt.getTime())}`,
      margin + 330,
      chrome.y + 24,
      { width: 66 }
    );

    const names = row.participants.slice(0, 3).map((p) => shortName(p.name));
    const extra = row.participants.length - names.length;
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7);
    doc.text(
      row.participants.length === 0
        ? "Sin participantes"
        : names.join(", ") + (extra > 0 ? ` +${extra}` : ""),
      margin + 401,
      chrome.y + 12,
      { width: 100, height: 26, ellipsis: true }
    );

    chrome.y += rowHeight;
  });

  chrome.drawFooter();
  doc.end();
}
