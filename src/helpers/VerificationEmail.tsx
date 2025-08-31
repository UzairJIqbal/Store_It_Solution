import { resend } from "@/lib/resend";
import VerificationEmail from "../../emails/VerificationEmailTemplate";

export async function sendVerificationEmail(
  email: string,
  password: string
): Promise<any> {
  try {
    await resend.emails.send({
      from: "Acme <onboarding@resend.dev>",
      to: email,
      subject: "Mystry Code || Verification Code",
      react: VerificationEmail({ email, password}),
    });

    return { success: true, message: "Verification Email Send Successfully" };
  } catch (errorEmail) {
    console.log("Error Sending Verification Email");
    return { success: false, message: "Failed to send Verification Email" };
  }
}