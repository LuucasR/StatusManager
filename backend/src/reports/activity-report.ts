import type { ActivityStatus } from "@prisma/client";
import { LOCALE } from "../locale";
import { STATUS_META } from "../activities/activity-status";
import { segmentMs, workedByDay, workedMs } from "../activities/activity-summary";
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
  /** Snapshot of the declared task's title, if there was one. */
  taskTitle?: string | null;
  startedAt: Date;
  endedAt: Date | null;
  employee: {
    employeeNumber: number;
    name: string;
  };
};

/**
 * What goes in the DETAIL column. The comment stopped being mandatory for
 * WORKING once the task could be declared: without this fallback the column
 * would be empty for exactly the status that matters most in the report.
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
  /** Report range. Segments are clipped to it, so a status left open before or after the period only adds its share. */
  from?: Date;
  to?: Date;
  /** Timezone the per-day split is computed in. */
  timeZone: string;
  generatedAt?: Date;
};

const COLORS = REPORT_COLORS;
const STATUS = STATUS_META;

/** "Mon 21/09/2026" for the per-day table. The day is already a calendar day in the team's zone. */
function formatDay(day: string) {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

export function renderActivityReport(doc: any, options: ReportOptions) {
  const generatedAt = options.generatedAt ?? new Date();
  const { width: pageWidth, margin, contentWidth } = PAGE;

  const { from, to, timeZone } = options;
  // Open segments are counted up to generation time, clipped to the range.
  const durationMs = (row: ReportActivity) => segmentMs(row, from, to, generatedAt);

  const employees = new Map<number, { employee: ReportActivity["employee"]; rows: ReportActivity[] }>();
  for (const row of options.rows) {
    const entry = employees.get(row.employee.employeeNumber) ?? { employee: row.employee, rows: [] };
    entry.rows.push(row);
    employees.set(row.employee.employeeNumber, entry);
  }
  const totalDuration = options.rows.reduce((total, row) => total + durationMs(row), 0);
  const totalWorked = workedMs(options.rows, from, to, generatedAt);

  const chrome = createReportChrome(doc, {
    title: options.title,
    subtitle: options.subtitle,
    periodLabel: options.periodLabel,
    footerLabel: "Status Manager - Activity log",
    continuationTitle: "Activity log continued",
    generatedAt,
  });

  const drawTableHeader = () => {
    doc.roundedRect(margin, chrome.y, contentWidth, 24, 5).fill(COLORS.ink);
    doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(7.5);
    doc.text("EMPLOYEE", margin + 10, chrome.y + 8, { width: 105 });
    doc.text("STATUS", margin + 120, chrome.y + 8, { width: 78 });
    doc.text("START", margin + 203, chrome.y + 8, { width: 72 });
    doc.text("DURATION", margin + 280, chrome.y + 8, { width: 62 });
    doc.text("DETAIL", margin + 347, chrome.y + 8, { width: 154 });
    chrome.y += 30;
  };

  chrome.drawCover();

  chrome.drawKpiCards([
    { label: "HOURS WORKED", value: formatDuration(totalWorked), highlight: true },
    { label: "TIME LOGGED (ALL STATUSES)", value: formatDuration(totalDuration) },
    employees.size > 1
      ? { label: "EMPLOYEES", value: String(employees.size) }
      : { label: "RECORDS", value: String(options.rows.length) },
  ]);

  // Worked hours, per employee when the report covers several, and per workday.
  const drawWorkedHeader = () => {
    doc.roundedRect(margin, chrome.y, contentWidth, 24, 5).fill(COLORS.ink);
    doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(7.5);
    doc.text("EMPLOYEE / DAY", margin + 10, chrome.y + 8, { width: 300 });
    doc.text("HOURS WORKED", margin + 360, chrome.y + 8, { width: 140, align: "right" });
    chrome.y += 30;
  };
  const drawWorkedRow = (label: string, ms: number, bold: boolean) => {
    const rowHeight = bold ? 24 : 20;
    chrome.ensureRoom(rowHeight, drawWorkedHeader);
    if (bold) doc.roundedRect(margin, chrome.y, contentWidth, rowHeight - 4, 5).fill(COLORS.surface);
    doc.fillColor(bold ? COLORS.ink : COLORS.muted).font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
    doc.text(label, margin + (bold ? 10 : 24), chrome.y + 5, { width: 320 });
    doc.fillColor(bold ? COLORS.primary : COLORS.ink).font("Helvetica-Bold").fontSize(8.5);
    doc.text(formatDuration(ms), margin + 360, chrome.y + 5, { width: 140, align: "right" });
    chrome.y += rowHeight;
  };

  chrome.drawSectionTitle(
    "Hours worked",
    "Only time spent in the Working status counts. Breaks, lunch, meetings and away time are logged but not counted as worked."
  );
  drawWorkedHeader();
  if (options.rows.length === 0) {
    chrome.drawEmptyState("No activity recorded for the selected period.");
  }
  for (const { employee, rows } of [...employees.values()].sort((a, b) => a.employee.name.localeCompare(b.employee.name))) {
    drawWorkedRow(
      `${truncate(employee.name, 40)}  #${employee.employeeNumber}`,
      workedMs(rows, from, to, generatedAt),
      true
    );
    for (const { day, ms } of workedByDay(rows, from, to, timeZone, generatedAt)) {
      drawWorkedRow(formatDay(day), ms, false);
    }
  }
  chrome.y += 14;
  chrome.ensureRoom(90, () => {});

  chrome.drawSectionTitle(
    "Activity detail",
    "Open statuses are counted up to the moment the report was generated, clipped to the report period. Disconnected periods are not included."
  );
  drawTableHeader();

  if (options.rows.length === 0) {
    chrome.drawEmptyState("No activity recorded for the selected period.");
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
    doc.text(formatDuration(durationMs(row)), margin + 280, chrome.y + 16, { width: 62 });

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
