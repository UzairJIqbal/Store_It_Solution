import { resend } from "@/lib/resend";
import VerificationEmail from "../../emails/VerificationEmailTemplate";

export async function sendVerificationEmail(
  email: string,
  password: string
): Promise<{ success: boolean, message: string }> {
  try {
    // Resend reports a rejected email (e.g. a sandbox sender writing to someone else) in `error`, it doesn't throw
    const { error } = await resend.emails.send({
      from: "StoreIt <onboarding@resend.dev>",
      to: email,
      subject: "Your StoreIt sign-in code",
      react: VerificationEmail({ email, password }),
    });
    if (error) {
      console.error("Resend rejected the verification email", error);
      return { success: false, message: "We couldn't email your sign-in code. Please try again in a minute." };
    }

    return { success: true, message: "Verification Email Send Successfully" };
  } catch (errorEmail) {
    console.error("Error Sending Verification Email", errorEmail);
    return { success: false, message: "We couldn't email your sign-in code. Please try again in a minute." };
  }
}
