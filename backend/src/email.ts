import nodemailer from "nodemailer";

type Mail = {
  subject: string;
  text: string;
  html?: string;
};

export async function sendMail(to: string, mail: Mail) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    console.log("Falta configuración SMTP");
    return false;
  }

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  });

  try {
    console.log("Intentando enviar correo...");

    await transport.sendMail({
      from: process.env.EMAIL_FROM ?? SMTP_USER,
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    console.log("Correo enviado correctamente");
    return true;
  } catch (error) {
    console.error("Error de Nodemailer:", error);
    throw error;
  }
}

export async function notifyAdmin(mail: Mail) {
  const { ADMIN_NOTIFICATION_EMAIL } = process.env;

  if (!ADMIN_NOTIFICATION_EMAIL) {
    return false;
  }

  return sendMail(ADMIN_NOTIFICATION_EMAIL, mail);
}