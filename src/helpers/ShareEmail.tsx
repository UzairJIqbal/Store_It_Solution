import { resend } from "@/lib/resend";
import ShareEmail from "../../emails/ShareEmailTemplate";

export async function sendShareEmail({ to, sharerName, fileName, role, message, url }: {
  to: string,
  sharerName: string,
  fileName: string,
  role: "viewer" | "editor",
  message?: string,
  url: string,
}) {
  // Resend reports failures in the result rather than throwing
  const { error } = await resend.emails.send({
    from: "StoreIt <onboarding@resend.dev>",
    to,
    subject: `${sharerName} shared "${fileName}" with you`,
    react: ShareEmail({ sharerName, fileName, role, message, url }),
  });
  if (error) {
    console.error("Failed to send share email", error);
    return false;
  }
  return true;
}
