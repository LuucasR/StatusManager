import type { PatchCategory, PatchWeekStatus, TaskState } from "@prisma/client";
import type { TeamTaskTime } from "../activities/activity-summary";
import { TASK_STATE_META } from "../tasks/task-state";
import {
  PAGE,
  REPORT_COLORS,
  createReportChrome,
  formatDate,
  formatDuration,
  truncate,
} from "./report-layout";

export type ReportPatchEntry = {
  authorName: string;
  taskId: number | null;
  taskTitle: string | null;
  taskState: TaskState | null;
  category: PatchCategory;
  body: string;
  internal: boolean;
};

type PatchNotesReportOptions = {
  /** internal: times, people and internal notes. public: the player-facing text only. */
  mode: "internal" | "public";
  weekStart: string;
  weekEnd: string;
  version: string | null;
  title: string | null;
  summary: string;
  status: PatchWeekStatus;
  publishedAt: Date | null;
  entries: ReportPatchEntry[];
  taskTimes: TeamTaskTime[];
  generatedAt?: Date;
};

const COLORS = REPORT_COLORS;

/** Printing order and headings. Record<> so a new category fails to compile here. */
const CATEGORY_META: Record<PatchCategory, { label: string; order: number }> = {
  FEATURE: { label: "New features", order: 0 },
  CONTENT: { label: "Content", order: 1 },
  BALANCE: { label: "Balance", order: 2 },
  FIX: { label: "Bug fixes", order: 3 },
  ART: { label: "Art", order: 4 },
  AUDIO: { label: "Audio", order: 5 },
  UI: { label: "UI / UX", order: 6 },
  PERFORMANCE: { label: "Performance", order: 7 },
  OTHER: { label: "Other", order: 8 },
};

const STATUS_LABEL: Record<PatchWeekStatus, string> = {
  DRAFT: "Draft",
  CLOSED: "Closed for review",
  PUBLISHED: "Published",
};

/** A calendar day string, read at noon UTC so no offset moves it. */
function formatDay(day: string) {
  return formatDate(new Date(`${day}T12:00:00Z`));
}

function taskKey(entry: Pick<ReportPatchEntry, "taskId" | "taskTitle">) {
  if (entry.taskId != null) return `id:${entry.taskId}`;
  return entry.taskTitle ? `title:${entry.taskTitle}` : null;
}

export function renderPatchNotesReport(doc: any, options: PatchNotesReportOptions) {
  const generatedAt = options.generatedAt ?? new Date();
  const { margin, contentWidth } = PAGE;
  const internal = options.mode === "internal";

  const entries = internal ? options.entries : options.entries.filter((entry) => !entry.internal);
  const timeByTask = new Map(options.taskTimes.map((task) => [task.key, task]));
  const contributors = new Set(entries.map((entry) => entry.authorName));
  const totalMs = options.taskTimes.reduce((sum, task) => sum + task.totalMs, 0);

  const heading = options.version ? `Patch notes ${options.version}` : "Patch notes";
  const chrome = createReportChrome(doc, {
    title: heading,
    subtitle: [
      options.title ?? `Week of ${formatDay(options.weekStart)}`,
      internal ? "Internal edition - includes team time" : null,
      options.status === "PUBLISHED" ? null : STATUS_LABEL[options.status],
    ]
      .filter(Boolean)
      .join(" - "),
    periodLabel: `${formatDay(options.weekStart)} to ${formatDay(options.weekEnd)}`,
    footerLabel: `Status Manager - ${heading}${internal ? " (internal)" : ""}`,
    continuationTitle: `${heading} continued`,
    generatedAt,
  });

  const noHeader = () => {};

  chrome.drawCover();

  chrome.drawKpiCards(
    internal
      ? [
          { label: "TEAM TIME ON TASKS", value: formatDuration(totalMs), highlight: true },
          { label: "ENTRIES", value: String(entries.length) },
          { label: "CONTRIBUTORS", value: String(contributors.size) },
        ]
      : [
          { label: "CHANGES", value: String(entries.length), highlight: true },
          {
            label: "AREAS",
            value: String(new Set(entries.map((entry) => entry.category)).size),
          },
          {
            label: "RELEASED",
            value: options.publishedAt ? formatDate(options.publishedAt) : "-",
          },
        ]
  );

  // Staff intro.
  if (options.summary.trim()) {
    doc.font("Helvetica").fontSize(10);
    const height = doc.heightOfString(options.summary, { width: contentWidth - 28 });
    chrome.ensureRoom(height + 28, noHeader);
    doc.roundedRect(margin, chrome.y, contentWidth, height + 20, 8).fill(COLORS.surface);
    doc.fillColor(COLORS.ink).font("Helvetica").fontSize(10);
    doc.text(options.summary, margin + 14, chrome.y + 10, { width: contentWidth - 28 });
    chrome.y += height + 32;
  }

  if (entries.length === 0) {
    chrome.drawEmptyState("Nobody has written patch notes for this week yet.");
  }

  const byCategory = new Map<PatchCategory, ReportPatchEntry[]>();
  for (const entry of entries) {
    byCategory.set(entry.category, [...(byCategory.get(entry.category) ?? []), entry]);
  }
  const categories = [...byCategory.keys()].sort(
    (a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order
  );

  for (const category of categories) {
    const list = byCategory.get(category)!;
    chrome.ensureRoom(42 + 50, noHeader);
    chrome.drawSectionTitle(`${CATEGORY_META[category].label} (${list.length})`);
    // drawSectionTitle reserves room for a note line these headings do not use.
    chrome.y -= 16;

    for (const entry of list) {
      const time = internal ? timeByTask.get(taskKey(entry) ?? "") : undefined;
      const metaLines: string[] = [];
      if (internal) {
        const task = entry.taskTitle
          ? `Task${entry.taskId != null ? ` #${entry.taskId}` : " (deleted)"}: ${truncate(entry.taskTitle, 70)}${
              entry.taskState ? ` - ${TASK_STATE_META[entry.taskState].label}` : ""
            }`
          : "No linked task";
        metaLines.push(`${task}   |   Written by ${entry.authorName}`);
        if (entry.taskTitle) {
          metaLines.push(
            time
              ? `Time this week: ${formatDuration(time.totalMs)}  (${time.byEmployee
                  .map((person) => `${person.name} ${formatDuration(person.ms)}`)
                  .join(", ")})`
              : "Time this week: none booked"
          );
        }
      }

      const textWidth = contentWidth - 24;
      doc.font("Helvetica").fontSize(10);
      const bodyHeight = doc.heightOfString(entry.body, { width: textWidth });
      doc.font("Helvetica").fontSize(7.5);
      const metaHeight = metaLines.reduce(
        (sum, line) => sum + doc.heightOfString(line, { width: textWidth }) + 2,
        0
      );
      const blockHeight = bodyHeight + (metaLines.length ? metaHeight + 8 : 0) + 16;

      chrome.ensureRoom(blockHeight + 8, noHeader);
      const top = chrome.y;

      doc.rect(margin, top, 3, blockHeight).fill(entry.internal ? COLORS.muted : COLORS.primary);

      let y = top + 6;
      if (entry.internal) {
        doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(6.5);
        doc.text("INTERNAL", margin + contentWidth - 60, y, { width: 60, align: "right" });
      }
      doc.fillColor(COLORS.ink).font("Helvetica").fontSize(10);
      doc.text(entry.body, margin + 14, y, { width: textWidth });
      y += bodyHeight + 6;

      if (metaLines.length) {
        doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5);
        for (const line of metaLines) {
          doc.text(line, margin + 14, y, { width: textWidth });
          y += doc.heightOfString(line, { width: textWidth }) + 2;
        }
      }

      chrome.y = top + blockHeight + 8;
    }
    chrome.y += 8;
  }

  // Appendix: every task with booked time, flagging the ones nobody wrote about.
  if (internal) {
    const noted = new Set(options.entries.map(taskKey).filter(Boolean));

    const drawTableHeader = () => {
      doc.roundedRect(margin, chrome.y, contentWidth, 24, 5).fill(COLORS.ink);
      doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(7.5);
      doc.text("TASK", margin + 10, chrome.y + 8, { width: 200 });
      doc.text("WHO", margin + 215, chrome.y + 8, { width: 200 });
      doc.text("TIME", margin + 420, chrome.y + 8, { width: 80, align: "right" });
      chrome.y += 30;
    };

    chrome.ensureRoom(42 + 30 + 40, noHeader);
    chrome.drawSectionTitle(
      "Time per task",
      "WORKING time the team booked against each task this week. Tasks marked NO NOTES have time but no patch note entry."
    );

    if (options.taskTimes.length === 0) {
      chrome.drawEmptyState("No time was booked against tasks this week.");
    } else {
      drawTableHeader();
      options.taskTimes.forEach((task, index) => {
        const who = task.byEmployee
          .map((person) => `${person.name} ${formatDuration(person.ms)}`)
          .join("\n");
        doc.font("Helvetica").fontSize(8);
        const rowHeight = Math.max(26, doc.heightOfString(who, { width: 200 }) + 14);
        chrome.ensureRoom(rowHeight, drawTableHeader);

        if (index % 2 === 0) doc.rect(margin, chrome.y - 4, contentWidth, rowHeight).fill(COLORS.surface);

        const undocumented = !noted.has(task.key);
        doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8.5);
        doc.text(
          `${task.taskId != null ? `#${task.taskId} ` : ""}${truncate(task.title, 40)}`,
          margin + 10,
          chrome.y + 2,
          { width: 200 }
        );
        if (undocumented) {
          doc.fillColor(COLORS.primary).font("Helvetica-Bold").fontSize(6.5);
          doc.text("NO NOTES", margin + 10, chrome.y + 13, { width: 200 });
        }
        doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8);
        doc.text(who, margin + 215, chrome.y + 2, { width: 200 });
        doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8.5);
        doc.text(formatDuration(task.totalMs), margin + 420, chrome.y + 2, { width: 80, align: "right" });

        chrome.y += rowHeight;
      });
    }
  }

  chrome.drawFooter();
  doc.end();
}
