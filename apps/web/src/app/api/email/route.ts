import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

type TimestampField = "interview_invite_sent" | "acceptance_sent_at" | "rejection_sent_at";

const STATUS_TO_FIELD: Record<string, TimestampField> = {
  Interviewing: "interview_invite_sent",
  Accepted:     "acceptance_sent_at",
  Rejected:     "rejection_sent_at",
};

function bodyToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export async function POST(request: Request) {
  const { applicationId, subject, body } = await request.json() as {
    applicationId: string;
    subject: string;
    body: string;
  };

  // Fetch application + applicant
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { applicant: true },
  });

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Determine which timestamp field applies to the current status
  const timestampField = STATUS_TO_FIELD[application.status];
  if (!timestampField) {
    return NextResponse.json(
      { error: `No email defined for status: "${application.status}"` },
      { status: 400 }
    );
  }

  // Guard: don't send twice
  const alreadySentAt = application[timestampField] as Date | null;
  if (alreadySentAt) {
    return NextResponse.json(
      { error: "Email already sent", sentAt: alreadySentAt },
      { status: 409 }
    );
  }

  const to = application.applicant.preferred_email ?? application.applicant.email;

  try {
    const info = await sendEmail({
      to,
      subject,
      text: body,
      html: bodyToHtml(body),
    });

    // Only stamp the timestamp after a confirmed send
    await prisma.application.update({
      where: { id: applicationId },
      data: { [timestampField]: new Date() },
    });

    return NextResponse.json({ success: true, messageId: info.messageId });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
