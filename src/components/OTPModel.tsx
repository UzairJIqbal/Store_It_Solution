"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import React, { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { signInuser, verifySecret } from "@/lib/appwrite/actions/user.action";
import { useRouter } from "next/navigation";

const CODE_LENGTH = 6;
// Matches how long people usually wait before an email shows up
const RESEND_COOLDOWN = 30;

const OtpModal = ({ email, onClose }: { email: string, onClose: () => void }) => {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const verify = async (code: string) => {
    if (code.length !== CODE_LENGTH || isLoading) return;
    setIsLoading(true);
    setError("");
    setNotice("");
    const result = await verifySecret({ email, otp: code }).catch(() => null);
    if (result?.success) {
      router.push("/");
      return;
    }
    setError(result?.error ?? "We couldn't check your code. Please try again.");
    setOtp("");
    setIsLoading(false);
  };

  const resend = async () => {
    setResending(true);
    setError("");
    setNotice("");
    const result = await signInuser({ email }).catch(() => ({ error: "We couldn't send a new code. Please try again." }));
    setResending(false);
    if (result?.error) return setError(result.error);
    setOtp("");
    setNotice("New code sent. Earlier codes no longer work.");
    setCooldown(RESEND_COOLDOWN);
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="shad-alert-dialog">
        <button type="button" aria-label="Close" className="otp-close-button" onClick={onClose}>
          <X className="size-5" aria-hidden />
        </button>
        <AlertDialogHeader className="space-y-2 text-left">
          <AlertDialogTitle className="h2 text-light-100">Check your email</AlertDialogTitle>
          <AlertDialogDescription className="body-2 text-light-200">
            Enter the 6-digit verification code we sent to <span className="font-semibold text-light-100">{email}</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => { e.preventDefault(); void verify(otp); }}
        >
          <InputOTP
            maxLength={CODE_LENGTH}
            value={otp}
            onChange={(value) => { setOtp(value); setError(""); }}
            onComplete={verify}
            autoFocus
            aria-label="Verification code"
            aria-invalid={!!error}
            aria-describedby={error ? "otp-error" : undefined}
            disabled={isLoading}
            inputMode="numeric"
            pattern="^[0-9]+$"
          >
            <InputOTPGroup className="shad-otp">
              {Array.from({ length: CODE_LENGTH }, (_, i) => (
                <InputOTPSlot key={i} index={i} className="shad-otp-slot" />
              ))}
            </InputOTPGroup>
          </InputOTP>

          {error && <p id="otp-error" role="alert" className="error-message">{error}</p>}
          {notice && <p role="status" className="body-2 text-light-200">{notice}</p>}

          <button type="submit" className="form-submit-button" disabled={isLoading || otp.length !== CODE_LENGTH}>
            {isLoading ? <><Loader2 className="size-5 animate-spin" aria-hidden /> Checking code</> : "Verify and continue"}
          </button>
        </form>

        <p className="body-2 text-light-200">
          Didn&apos;t get it? Check spam, or{" "}
          {cooldown > 0 ? (
            <span>send a new code in {cooldown}s.</span>
          ) : (
            <button type="button" className="font-semibold text-brand underline-offset-4 hover:underline disabled:opacity-60"
              onClick={resend} disabled={resending}>
              {resending ? "sending…" : "send a new code"}
            </button>
          )}
        </p>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default OtpModal;
