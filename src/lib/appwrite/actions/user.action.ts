"use server";

import { createAdminClient, createSessionClient } from "@/lib/appwrite";
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

const getUserByEmail = async (email: string) => {
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

export const createAccount = async ({
    fullName,
    email,
}: {
    fullName: string;
    email: string;
}) => {
    const existingUser = await getUserByEmail(email);

    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    const emailResponse = await sendVerificationEmail(email, otp);
    if (!emailResponse.success) throw new Error(emailResponse.message);

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
        await createAdminClient();
        const user = await getUserByEmail(email);
        if (!user) throw new Error("User not found");


        if (user.otp !== otp || new Date(user.expireAt) < new Date()) {
            throw new Error("Invalid or expired OTP");
        }

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

export const signOutUser = async () => {
    const { account } = await createSessionClient()
    try {
        await account.deleteSession("current");
        (await cookies()).delete("appwrite-session");
    } catch (error: any) {
        handleError(error, "Failed to sign out user")
    } finally {
        redirect("/sign-in")
    }
}

export const signInuser = async ({ email }: { email: string }) => {
    try {

        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            const otp = Math.floor(1000 + Math.random() * 9000).toString();
            if (existingUser.otp !== otp || new Date(existingUser.expireAt) < new Date()) {
                const { databases } = await createAdminClient()
                await databases.updateDocument(
                    appwriteConfig.databaseId,
                    appwriteConfig.userCollectionId,
                    existingUser.$id,
                    {
                        otp,
                        expireAt: new Date(Date.now() + 20 * 60 * 1000)
                    }

                )
            }
            await sendVerificationEmail(email, otp);
        } else {
            if (!existingUser) {
                throw new Error("User not found");
            }
        }
        return paresStringify({ accountId: existingUser?.$id });
    } catch (error: any) {
        handleError(error, "Failed to sign In user")
    }
}