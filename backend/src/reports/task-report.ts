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
  checklist: { done: boolean }[];
  /** Real time spent in IN_PROGRESS, closed stretches only. */
  workedMs: number;
  /** Start of the open stretch, counted up to generation time. */
  inProgressSince: Date | null;
};

type TaskReportOptions = {
  title: string;
  subtitle: string;
  periodLabel: string;
  rows: ReportTask[];
  /**
   * Archive cutoff, computed by the router. Passed in as a parameter so this
   * module does not depend on the business rules in tasks/.
   */
  archiveCutoff: Date;
  generatedAt?: Date;
};

const COLORS = REPORT_COLORS;
const STATE = TASK_STATE_META;

/** First name only, so several participants fit in 100pt. */
function shortName(name: string) {
  return truncate(name.split(" ")[0] ?? name, 12);
}

export function renderTaskReport(doc: any, options: TaskReportOptions) {
  const generatedAt = options.generatedAt ?? new Date();
  const { width: pageWidth, margin, contentWidth } = PAGE;

  const isArchived = (row: ReportTask) => !row.pinned && row.endsAt < options.archiveCutoff;

  const doneCount = options.rows.filter((row) => row.state === "DONE").length;
  const archivedCount = options.rows.filter(isArchived).length;
  const realMs = (row: ReportTask) =>
    row.workedMs + (row.inProgressSince ? Math.max(0, generatedAt.getTime() - row.inProgressSince.getTime()) : 0);
  const totalWorked = options.rows.reduce((total, row) => total + realMs(row), 0);

  const chrome = createReportChrome(doc, {
    title: options.title,
    subtitle: options.subtitle,
    periodLabel: options.periodLabel,
    footerLabel: "Status Manager - Team tasks",
    continuationTitle: "Task list continued",
    generatedAt,
  });

  const drawTableHeader = () => {
    doc.roundedRect(margin, chrome.y, contentWidth, 24, 5).fill(COLORS.ink);
    doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(7.5);
    doc.text("TASK", margin + 10, chrome.y + 8, { width: 150 });
    doc.text("STATE", margin + 166, chrome.y + 8, { width: 72 });
    doc.text("DEADLINE", margin + 244, chrome.y + 8, { width: 96 });
    doc.text("REAL TIME", margin + 344, chrome.y + 8, { width: 62 });
    doc.text("PARTICIPANTS", margin + 410, chrome.y + 8, { width: 91 });
    chrome.y += 30;
  };

  chrome.drawCover();

  chrome.drawKpiCards([
    { label: "TASKS", value: String(options.rows.length) },
    { label: "DONE", value: `${doneCount} of ${options.rows.length}` },
    { label: "ARCHIVED", value: String(archivedCount) },
    { label: "TIME IN PROGRESS", value: formatDuration(totalWorked), highlight: true },
  ]);

  chrome.drawSectionTitle(
    "Task detail",
    "DEADLINE is the planned window; REAL TIME is the time actually spent In progress. Grey rows are archived (14+ days past their end); the violet bar marks pinned tasks."
  );
  drawTableHeader();

  if (options.rows.length === 0) {
    chrome.drawEmptyState("No tasks match the selected filters.");
  }

  options.rows.forEach((row, index) => {
    const rowHeight = 48;
    chrome.ensureRoom(rowHeight, drawTableHeader);

    const archived = isArchived(row);
    // Archived rows break the zebra striping with the surface grey: they read as
    // a distinct band without having to read the label.
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
    doc.text(truncate(row.title, 32), margin + 10, chrome.y + 10, { width: 150 });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7);
    doc.text(
      row.createdBy ? `#${row.id} · created by ${truncate(row.createdBy.name, 20)}` : `#${row.id}`,
      margin + 10,
      chrome.y + 25,
      { width: 150 }
    );

    if (row.checklist.length > 0) {
      const ticked = row.checklist.filter((item) => item.done).length;
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7);
      doc.text(`Checklist ${ticked}/${row.checklist.length}`, margin + 10, chrome.y + 34, {
        width: 150,
      });
    }

    const state = STATE[row.state];
    doc.roundedRect(margin + 166, chrome.y + 8, 72, 20, 6).fill(state.pale);
    doc.fillColor(state.color).font("Helvetica-Bold").fontSize(7);
    doc.text(state.label.toUpperCase(), margin + 170, chrome.y + 15, { width: 64, align: "center" });

    const marks = [row.pinned ? "PINNED" : "", archived ? "ARCHIVED" : ""].filter(Boolean);
    if (marks.length) {
      doc.fillColor(row.pinned ? COLORS.primary : COLORS.muted).font("Helvetica-Bold").fontSize(6.5);
      doc.text(marks.join(" · "), margin + 166, chrome.y + 32, { width: 72, align: "center" });
    }

    // Planned window: informative, it is how much time there was to do it.
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(7);
    doc.text(`${formatDate(row.startsAt)} ${formatTime(row.startsAt)}`, margin + 244, chrome.y + 8, { width: 96 });
    doc.text(`${formatDate(row.endsAt)} ${formatTime(row.endsAt)}`, margin + 244, chrome.y + 19, { width: 96 });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(6.5);
    doc.text(
      `${formatDuration(row.endsAt.getTime() - row.startsAt.getTime())} available`,
      margin + 244,
      chrome.y + 30,
      { width: 96 }
    );

    // Real time: sum of the stretches spent In progress.
    const real = realMs(row);
    doc.fillColor(real > 0 ? COLORS.primary : COLORS.muted).font("Helvetica-Bold").fontSize(8);
    doc.text(real > 0 ? formatDuration(real) : "-", margin + 344, chrome.y + 16, { width: 62 });

    const names = row.participants.slice(0, 3).map((p) => shortName(p.name));
    const extra = row.participants.length - names.length;
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7);
    doc.text(
      row.participants.length === 0
        ? "No participants"
        : names.join(", ") + (extra > 0 ? ` +${extra}` : ""),
      margin + 410,
      chrome.y + 12,
      { width: 91, height: 26, ellipsis: true }
    );

    chrome.y += rowHeight;
  });

  chrome.drawFooter();
  doc.end();
}
