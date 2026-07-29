import nodemailer from "nodemailer";

type Mail = { subject: string; text: string; html?: string };

export async function sendMail(to: string, mail: Mail) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  const missing = [
    ["SMTP_HOST", SMTP_HOST],
    ["SMTP_USER", SMTP_USER],
    ["SMTP_PASSWORD", SMTP_PASSWORD],
  ]
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing SMTP variables: ${missing.join(", ")}`);
  }

  const host = SMTP_HOST!.trim();
  const user = SMTP_USER!.trim();
  const password =
    host.toLowerCase() === "smtp.gmail.com"
      ? SMTP_PASSWORD!.replace(/\s/g, "")
      : SMTP_PASSWORD!;
  const port = Number(SMTP_PORT ?? 587);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("SMTP_PORT must be a valid port number");
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: password },
  });
  await transport.sendMail({
    from: process.env.EMAIL_FROM?.trim() || user,
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  return true;
}

export async function notifyAdmin(mail: Mail) {
  const { ADMIN_NOTIFICATION_EMAIL } = process.env;
  if (!ADMIN_NOTIFICATION_EMAIL) return false;
  return sendMail(ADMIN_NOTIFICATION_EMAIL, mail);
}
