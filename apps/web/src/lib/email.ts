import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const info = await transporter.sendMail({
    from: '"RCC Recruiting" <rcc.ats.recruiting@gmail.com>',
    to,
    subject,
    text,
    html,
  });

  return info;
}
