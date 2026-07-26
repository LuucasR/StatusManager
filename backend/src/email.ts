import nodemailer from "nodemailer";

type Mail = { subject: string; text: string };

export async function notifyAdmin(mail: Mail) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, ADMIN_NOTIFICATION_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !ADMIN_NOTIFICATION_EMAIL) return;
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  await transport.sendMail({
    from: process.env.EMAIL_FROM ?? SMTP_USER,
    to: ADMIN_NOTIFICATION_EMAIL,
    subject: mail.subject,
    text: mail.text,
  });
}
