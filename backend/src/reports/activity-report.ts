type ActivityStatus =
  | "AVAILABLE"
  | "WORKING"
  | "BREAK"
  | "LUNCH"
  | "MEETING"
  | "OFFLINE";

export type ReportActivity = {
  status: ActivityStatus;
  detail: string;
  startedAt: Date;
  endedAt: Date | null;
  employee: {
    employeeNumber: number;
    name: string;
  };
};

type ReportOptions = {
  title: string;
  subtitle: string;
  periodLabel: string;
  rows: ReportActivity[];
  generatedAt?: Date;
};

const COLORS = {
  ink: "#17182F",
  muted: "#6D7087",
  line: "#E8E9F1",
  surface: "#F6F7FB",
  primary: "#5B5CE2",
  primaryDark: "#4546BA",
  white: "#FFFFFF",
};

const STATUS: Record<ActivityStatus, { label: string; color: string; pale: string }> = {
  AVAILABLE: { label: "Disponible", color: "#208454", pale: "#E5F6ED" },
  WORKING: { label: "Trabajando", color: "#4C4DC9", pale: "#ECECFF" },
  BREAK: { label: "Descanso", color: "#A66A00", pale: "#FFF2D8" },
  LUNCH: { label: "Almuerzo", color: "#8C4EA3", pale: "#F5E9FA" },
  MEETING: { label: "Reunion", color: "#16738B", pale: "#E2F5F8" },
  OFFLINE: { label: "Ausente", color: "#666A7D", pale: "#ECEEF2" },
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function durationMs(row: ReportActivity, generatedAt: Date) {
  return Math.max(0, (row.endedAt ?? generatedAt).getTime() - row.startedAt.getTime());
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${String(minutes).padStart(2, "0")} min`;
}

function truncate(value: string, maxLength: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 1)}...`;
}

export function renderActivityReport(doc: any, options: ReportOptions) {
  const generatedAt = options.generatedAt ?? new Date();
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  let pageNumber = 1;
  let y = 0;

  const employeeCount = new Set(options.rows.map((row) => row.employee.employeeNumber)).size;
  const totalDuration = options.rows.reduce((total, row) => total + durationMs(row, generatedAt), 0);

  const drawBrandHeader = () => {
    doc.save();
    doc.rect(0, 0, pageWidth, 128).fill(COLORS.primary);
    doc.rect(0, 108, pageWidth, 20).fill(COLORS.primaryDark);

    doc.circle(margin + 18, 38, 18).fill(COLORS.white);
    doc.fillColor(COLORS.primary).font("Helvetica-Bold").fontSize(11);
    doc.text("SM", margin + 7, 34, { width: 22, align: "center" });

    doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(9);
    doc.text("STATUS MANAGER", margin + 48, 25, { characterSpacing: 1.4 });
    doc.font("Helvetica-Bold").fontSize(23);
    doc.text(options.title, margin + 48, 43, { width: contentWidth - 48 });
    doc.font("Helvetica").fontSize(9.5).fillColor("#E7E7FF");
    doc.text(options.subtitle, margin + 48, 76, { width: contentWidth - 48 });
    doc.restore();
  };

  const drawFooter = () => {
    const footerY = pageHeight - 34;
    doc.moveTo(margin, footerY - 8).lineTo(pageWidth - margin, footerY - 8).lineWidth(0.7).stroke(COLORS.line);
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5);
    doc.text("Status Manager - Registro de actividades", margin, footerY, { width: 280 });
    doc.text(`Pagina ${pageNumber}`, pageWidth - margin - 90, footerY, { width: 90, align: "right" });
  };

  const drawTableHeader = () => {
    doc.roundedRect(margin, y, contentWidth, 24, 5).fill(COLORS.ink);
    doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(7.5);
    doc.text("EMPLEADO", margin + 10, y + 8, { width: 105 });
    doc.text("ESTADO", margin + 120, y + 8, { width: 78 });
    doc.text("INICIO", margin + 203, y + 8, { width: 72 });
    doc.text("DURACION", margin + 280, y + 8, { width: 62 });
    doc.text("DETALLE", margin + 347, y + 8, { width: 154 });
    y += 30;
  };

  const startContinuationPage = () => {
    drawFooter();
    doc.addPage();
    pageNumber += 1;
    y = 42;
    doc.fillColor(COLORS.primary).font("Helvetica-Bold").fontSize(8);
    doc.text("STATUS MANAGER", margin, y, { characterSpacing: 1.2 });
    y += 19;
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(12);
    doc.text("Continuacion del registro", margin, y);
    y += 24;
    drawTableHeader();
  };

  drawBrandHeader();
  y = 150;

  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7.5);
  doc.text("PERIODO DEL REPORTE", margin, y, { characterSpacing: 0.8 });
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(11);
  doc.text(options.periodLabel, margin, y + 12, { width: contentWidth - 180 });
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8);
  doc.text(
    `Generado el ${formatDate(generatedAt)} a las ${formatTime(generatedAt)}`,
    pageWidth - margin - 190,
    y + 4,
    { width: 190, align: "right" }
  );
  y += 45;

  const cards = [
    { label: "REGISTROS", value: String(options.rows.length) },
    { label: "EMPLEADOS", value: String(employeeCount) },
    { label: "TIEMPO REGISTRADO", value: formatDuration(totalDuration) },
  ];
  const cardGap = 10;
  const cardWidth = (contentWidth - cardGap * 2) / 3;
  cards.forEach((card, index) => {
    const x = margin + index * (cardWidth + cardGap);
    doc.roundedRect(x, y, cardWidth, 58, 8).fill(COLORS.surface);
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7);
    doc.text(card.label, x + 12, y + 12, { width: cardWidth - 24, characterSpacing: 0.6 });
    doc.fillColor(index === 2 ? COLORS.primary : COLORS.ink).font("Helvetica-Bold").fontSize(16);
    doc.text(card.value, x + 12, y + 29, { width: cardWidth - 24 });
  });
  y += 78;

  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(14);
  doc.text("Detalle de actividades", margin, y);
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8);
  doc.text("Los estados abiertos se calculan hasta el momento de generacion del reporte.", margin, y + 19);
  y += 42;
  drawTableHeader();

  if (options.rows.length === 0) {
    doc.roundedRect(margin, y, contentWidth, 72, 8).fill(COLORS.surface);
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10);
    doc.text("No hay actividades registradas para el periodo seleccionado.", margin + 20, y + 29, {
      width: contentWidth - 40,
      align: "center",
    });
    y += 82;
  }

  options.rows.forEach((row, index) => {
    const rowHeight = 48;
    if (y + rowHeight > pageHeight - 54) startContinuationPage();

    const background = index % 2 === 0 ? COLORS.white : "#FAFAFD";
    doc.roundedRect(margin, y, contentWidth, rowHeight - 4, 5).fill(background);
    doc.moveTo(margin, y + rowHeight - 4).lineTo(pageWidth - margin, y + rowHeight - 4).lineWidth(0.5).stroke(COLORS.line);

    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8.5);
    doc.text(truncate(row.employee.name, 24), margin + 10, y + 10, { width: 105 });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7);
    doc.text(`#${row.employee.employeeNumber}`, margin + 10, y + 25, { width: 105 });

    const status = STATUS[row.status];
    doc.roundedRect(margin + 120, y + 10, 76, 20, 6).fill(status.pale);
    doc.fillColor(status.color).font("Helvetica-Bold").fontSize(7);
    doc.text(status.label.toUpperCase(), margin + 126, y + 17, { width: 64, align: "center" });

    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(7.5);
    doc.text(formatDate(row.startedAt), margin + 203, y + 10, { width: 72 });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7);
    doc.text(formatTime(row.startedAt), margin + 203, y + 24, { width: 72 });

    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8);
    doc.text(formatDuration(durationMs(row, generatedAt)), margin + 280, y + 16, { width: 62 });

    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5);
    doc.text(truncate(row.detail, 92), margin + 347, y + 9, {
      width: 154,
      height: 31,
      ellipsis: true,
    });

    y += rowHeight;
  });

  drawFooter();
  doc.end();
}
