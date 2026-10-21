"use server";

import { createAdminClient } from "@/lib/appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";
import { Query, ID } from "node-appwrite";
import { paresStringify } from "@/lib/utils";
import { cookies } from "next/headers";
import { sendVerificationEmail } from "@/helpers/VerificationEmail";
import jwt from 'jsonwebtoken'
import { avatarPlaceholderUrl } from "../../../../constants";
import { get } from "http";
import { decode } from "punycode";
import { redirect } from "next/navigation";
import { string } from "zod";
import { randomInt, timingSafeEqual } from "crypto";

const OTP_LENGTH = 6;
// Wrong codes allowed before the code is thrown away and a new one must be requested
const MAX_OTP_ATTEMPTS = 5;

// A 6-digit code from the OS's secure random source (Math.random is predictable)
const generateOtp = () => randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");

const otpMatches = (stored: string | null | undefined, given: string) => {
    if (!stored || stored.length !== given.length) return false;
    return timingSafeEqual(Buffer.from(stored), Buffer.from(given));
};

// Emails are stored and compared lowercased, so sign-in and sharing agree on who someone is
const normalizeEmail = (email: string) => email.trim().toLowerCase();

const getUserByEmail = async (email: string) => {
    email = normalizeEmail(email);
    const { databases } = await createAdminClient();
    const result = await databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.userCollectionId,
        [Query.equal("email", [email])]
    );
    return result.total > 0 ? result.documents[0] : null;
};

const handleError = (error: unknown, message: string) => {
    console.log(error, message);
    throw error;
};

// Auth actions return { error } instead of throwing: production builds hide thrown messages from the browser,
// so the form could only ever show a generic failure
export const createAccount = async ({
    fullName,
    email,
}: {
    fullName: string;
    email: string;
}): Promise<{ success: boolean, error?: string }> => {
    try {
        return await createOrRefreshAccount({ fullName, email });
    } catch (error) {
        console.error("Failed to create account", error);
        return { success: false, error: "We couldn't create your account. Please try again." };
    }
};

const createOrRefreshAccount = async ({ fullName, email }: { fullName: string, email: string }) => {
    email = normalizeEmail(email);
    const existingUser = await getUserByEmail(email);

    const otp = generateOtp();

    const emailResponse = await sendVerificationEmail(email, otp);
    if (!emailResponse.success) return { success: false, error: emailResponse.message };

    const { databases } = await createAdminClient();
    const accountId = ID.unique()

    if (!existingUser) {
        await databases.createDocument(
            appwriteConfig.databaseId,
            appwriteConfig.userCollectionId,
            ID.unique(),
            {
                fullName,
                email,
                avatar: avatarPlaceholderUrl,
                otp,
                otpAttempts: 0,
                expireAt: new Date(Date.now() + 20 * 60 * 1000),
                accountId
            }
        );
    } else {
        await databases.updateDocument(
            appwriteConfig.databaseId,
            appwriteConfig.userCollectionId,
            existingUser.$id,
            {
                otp,
                otpAttempts: 0,
                expireAt: new Date(Date.now() + 20 * 60 * 1000)
            }
        );
    }

    return {
        success: true,
        message: "OTP generated successfully",
    };
};

export const verifySecret = async ({
    email,
    otp,
}: {
    email: string;
    otp: string;
}) => {
    try {
        const user = await getUserByEmail(email);
        if (!user) throw new Error("User not found");


        const { databases } = await createAdminClient();
        if (!otpMatches(user.otp, otp) || !user.expireAt || new Date(user.expireAt) < new Date()) {
            // Too many wrong guesses throw the code away, so a 6-digit code can't be brute-forced
            const attempts = (user.otpAttempts ?? 0) + 1;
            if (user.otp) {
                await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, user.$id,
                    attempts >= MAX_OTP_ATTEMPTS
                        ? { otp: null, expireAt: null, otpAttempts: 0 }
                        : { otpAttempts: attempts });
            }
            throw new Error("Invalid or expired OTP");
        }

        // Each code works once
        await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, user.$id, {
            otp: null,
            expireAt: null,
            otpAttempts: 0,
        });

        const token = jwt.sign(
            { userId: user.$id, email: user.email },
            process.env.JWT_SECRET!,
            { expiresIn: "1h" }
        );

        (await cookies()).set("appwrite-session", token, {
            path: "/",
            httpOnly: true,
            sameSite: "strict",
            secure: true,
        });

        return { success: true };
    } catch (error) {
        handleError(error, "Failed to verify OTP");
    }
};

export const getCurrentUser = async () => {
    const getCookieValue = await cookies()
    const token = getCookieValue.get('appwrite-session')
    if (!token) return null

    try {
        const decoded = jwt.verify(token.value, process.env.JWT_SECRET!) as unknown as {
            userId: string,
            email: string
        }
        const { databases } = await createAdminClient()
        const user = await databases.listDocuments(
            appwriteConfig.databaseId,
            appwriteConfig.userCollectionId,
            [Query.equal("$id", decoded.userId)]
        )
        if (user.total <= 0) return null

        return paresStringify(user.documents[0])
    } catch (error) {
        console.error("JWT verification failed:", error)
        return null
    }
}

// The session cookie holds the app's own JWT, not an Appwrite session, so signing out only clears the cookie
export const signOutUser = async () => {
    (await cookies()).delete("appwrite-session");
    redirect("/sign-in")
}

export const signInuser = async ({ email }: { email: string }): Promise<{ accountId?: string, error?: string }> => {
    try {
        const existingUser = await getUserByEmail(email);
        if (!existingUser) return { error: "No account uses this email yet. Sign up first." };

        // A new code replaces any earlier one
        const otp = generateOtp();
        const { databases } = await createAdminClient()
        await databases.updateDocument(
            appwriteConfig.databaseId,
            appwriteConfig.userCollectionId,
            existingUser.$id,
            {
                otp,
                otpAttempts: 0,
                expireAt: new Date(Date.now() + 20 * 60 * 1000)
            }
        )
        const emailResponse = await sendVerificationEmail(email, otp);
        if (!emailResponse.success) return { error: emailResponse.message };

        return paresStringify({ accountId: existingUser.$id });
    } catch (error) {
        console.error("Failed to sign In user", error);
        return { error: "We couldn't sign you in. Please try again." };
    }
}