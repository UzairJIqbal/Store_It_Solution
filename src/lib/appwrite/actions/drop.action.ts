'use server'

// Drop links: a public page where anyone can upload files into one of the owner's folders without an account.
// Each drop has its own Appwrite Auth user that only mints upload JWTs, so visitors never get the owner's
// credentials. Finished uploads are handed over to the owner: the bytes are re-permissioned and a file
// document is created in the drop's folder.

import { AppwriteException, ID, Permission, Query, Role } from "node-appwrite"
import { randomBytes } from "crypto"
import { revalidatePath } from "next/cache"
import { createAdminClient } from ".."
import { appwriteConfig } from "../config"
import { constructFileUrl, getFileType } from "@/lib/utils"
import { DropDocument, fileDocument } from "../../../../types"
import { MAX_FILE_SIZE, STORAGE_LIMIT } from "../../../../constants"
import { ActionResult, getOwnedFolder, listAll, requireUser, revalidateBrowser } from "./shared"
import { logActivity, storageUsedBy } from "./lifecycle"
import { sanitizeSmart } from "@/lib/smart/sanitize"
import { nextFreeName } from "./names"
import { dropIsOpen, findDropByCode } from "./drops"

type Admin = Awaited<ReturnType<typeof createAdminClient>>

const JWT_SECONDS = 15 * 60
// Files one visitor can send in one go
const MAX_BATCH = 20
const MAX_NAME = 60

const EXPIRY_DAYS = [1, 7, 30] as const
export type DropExpiry = (typeof EXPIRY_DAYS)[number] | null

const newCode = () => randomBytes(18).toString("base64url")

const cleanText = (value: unknown, max: number) =>
    typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""

const getMyDrop = async (databases: Admin["databases"], dropId: string, userId: string) => {
    const drop = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.dropsCollectionId, dropId)
        .catch(() => null) as unknown as DropDocument | null
    return drop && drop.ownerId === userId ? drop : null
}

// ---------- Owner actions ----------

export const createDrop = async ({ title, message, expiresInDays }: {
    title: string,
    message?: string,
    expiresInDays: DropExpiry,
}): Promise<ActionResult<{ dropId: string, code: string }>> => {
    try {
        const user = await requireUser()
        const { databases, users } = await createAdminClient()
        const cleanTitle = cleanText(title, 120)
        if (!cleanTitle) return { ok: false, error: "Give the drop link a title" }
        if (expiresInDays !== null && !EXPIRY_DAYS.includes(expiresInDays)) return { ok: false, error: "Pick an expiry" }

        // Uploads land in a new root folder named after the drop
        const taken = new Set((await listAll<{ name: string }>(databases, appwriteConfig.foldersCollectionId, [
            Query.equal("ownerId", [user.$id]),
            Query.isNull("parentId"),
            Query.isNull("trashedAt"),
            Query.select(["name"]),
        ])).map((f) => f.name))
        const folderName = taken.has(cleanTitle) ? nextFreeName(cleanTitle, taken) : cleanTitle
        const folder = await databases.createDocument(appwriteConfig.databaseId, appwriteConfig.foldersCollectionId, ID.unique(), {
            name: folderName,
            parentId: null,
            ancestors: [],
            ownerId: user.$id,
            accountId: user.accountId,
            users: [],
        })

        const uploader = await users.create(ID.unique(), undefined, undefined, undefined, "StoreIt drop")
        const code = newCode()
        try {
            const drop = await databases.createDocument(appwriteConfig.databaseId, appwriteConfig.dropsCollectionId, ID.unique(), {
                ownerId: user.$id,
                accountId: user.accountId,
                code,
                title: cleanTitle,
                message: cleanText(message, 500) || null,
                folderId: folder.$id,
                uploaderId: uploader.$id,
                enabled: true,
                expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString() : null,
            })
            revalidatePath("/drops")
            revalidateBrowser()
            return { ok: true, data: { dropId: drop.$id, code } }
        } catch (error) {
            await users.delete(uploader.$id).catch(() => undefined)
            throw error
        }
    } catch (error) {
        console.error("Failed to create drop", error)
        return { ok: false, error: "Couldn't create the drop link" }
    }
}

export const setDropEnabled = async ({ dropId, enabled }: { dropId: string, enabled: boolean }): Promise<ActionResult> => {
    try {
        const user = await requireUser()
        const { databases } = await createAdminClient()
        if (!await getMyDrop(databases, dropId, user.$id)) return { ok: false, error: "Drop link not found" }
        await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.dropsCollectionId, dropId, { enabled })
        revalidatePath("/drops")
        return { ok: true }
    } catch (error) {
        console.error("Failed to update drop", error)
        return { ok: false, error: "Couldn't update the drop link" }
    }
}

// Removes the link and its upload user. Files already received stay in the owner's folder.
export const deleteDrop = async ({ dropId }: { dropId: string }): Promise<ActionResult> => {
    try {
        const user = await requireUser()
        const { databases, users } = await createAdminClient()
        const drop = await getMyDrop(databases, dropId, user.$id)
        if (!drop) return { ok: false, error: "Drop link not found" }
        await databases.deleteDocument(appwriteConfig.databaseId, appwriteConfig.dropsCollectionId, dropId)
        await users.delete(drop.uploaderId).catch((error) => console.error("Failed to delete drop uploader", error))
        revalidatePath("/drops")
        return { ok: true }
    } catch (error) {
        console.error("Failed to delete drop", error)
        return { ok: false, error: "Couldn't delete the drop link" }
    }
}

// ---------- Public actions (no sign-in) ----------

const CLOSED = "This drop link isn't accepting files any more"

const openDrop = async (databases: Admin["databases"], code: string) => {
    const drop = await findDropByCode(databases, code)
    return drop && dropIsOpen(drop) ? drop : null
}

const mintDropJwt = async ({ users }: Admin, drop: DropDocument) =>
    (await users.createJWT(drop.uploaderId, undefined, JWT_SECONDS)).jwt

export const prepareDropUpload = async ({ code, files }: {
    code: string,
    files: { name: string, size: number }[],
}): Promise<ActionResult<string>> => {
    try {
        const admin = await createAdminClient()
        const drop = await openDrop(admin.databases, code)
        if (!drop) return { ok: false, error: CLOSED }
        if (files.length === 0) return { ok: false, error: "Pick some files to send" }
        if (files.length > MAX_BATCH) return { ok: false, error: `Send at most ${MAX_BATCH} files at a time` }
        if (files.some((f) => !(f.size > 0))) return { ok: false, error: "Empty files can't be sent" }
        if (files.some((f) => f.size > MAX_FILE_SIZE)) return { ok: false, error: "Files must be 50 MB or smaller" }
        if (drop.filesReceived + files.length > drop.maxFiles) {
            const left = Math.max(0, drop.maxFiles - drop.filesReceived)
            return { ok: false, error: left ? `This link can take ${left} more file${left === 1 ? "" : "s"}` : CLOSED }
        }
        const { used } = await storageUsedBy(admin.databases, drop.accountId)
        if (used + files.reduce((sum, f) => sum + f.size, 0) > STORAGE_LIMIT) {
            return { ok: false, error: "The owner doesn't have enough storage for these files" }
        }
        return { ok: true, data: await mintDropJwt(admin, drop) }
    } catch (error) {
        console.error("Failed to prepare drop upload", error)
        return { ok: false, error: "Couldn't start the upload" }
    }
}

export const refreshDropToken = async ({ code }: { code: string }): Promise<ActionResult<string>> => {
    try {
        const admin = await createAdminClient()
        const drop = await openDrop(admin.databases, code)
        if (!drop) return { ok: false, error: CLOSED }
        return { ok: true, data: await mintDropJwt(admin, drop) }
    } catch (error) {
        console.error("Failed to refresh drop token", error)
        return { ok: false, error: "Couldn't continue the upload" }
    }
}

export const completeDropUpload = async ({ code, bucketFileId, name, uploaderName, smart }: {
    code: string,
    bucketFileId: string,
    name: string,
    uploaderName: string,
    smart?: { tags: string[], content: string | null },
}): Promise<ActionResult> => {
    try {
        const admin = await createAdminClient()
        const { databases, storage } = admin
        const drop = await openDrop(databases, code)
        const stored = await storage.getFile(appwriteConfig.bucketId, bucketFileId).catch(() => null)
        // Only bytes this drop's upload user created can be claimed
        if (!stored || !stored.$permissions.includes(`read("user:${drop?.uploaderId ?? "-"}")`)) {
            return { ok: false, error: "Upload not found" }
        }
        const discard = () => storage.deleteFile(appwriteConfig.bucketId, bucketFileId).catch(() => undefined)
        if (!drop) {
            await discard()
            return { ok: false, error: CLOSED }
        }
        if (stored.chunksUploaded !== stored.chunksTotal) return { ok: false, error: "The upload didn't finish" }
        if (stored.sizeOriginal > MAX_FILE_SIZE || drop.filesReceived >= drop.maxFiles) {
            await discard()
            return { ok: false, error: drop.filesReceived >= drop.maxFiles ? CLOSED : "Files must be 50 MB or smaller" }
        }
        // Checked again: other visitors may have filled the owner's storage since this upload started
        const { used } = await storageUsedBy(databases, drop.accountId)
        if (used + stored.sizeOriginal > STORAGE_LIMIT) {
            await discard()
            return { ok: false, error: "The owner doesn't have enough storage for this file" }
        }

        // Hand the bytes to the owner; the drop's upload user loses access
        const owner = Role.user(drop.accountId)
        await storage.updateFile(appwriteConfig.bucketId, bucketFileId, undefined, [
            Permission.read(owner), Permission.update(owner), Permission.delete(owner),
        ])

        // The drop's folder, or My Files if it was deleted or trashed
        const folderId = drop.folderId && await getOwnedFolder(databases, drop.folderId, drop.ownerId) ? drop.folderId : null
        const siblings = await listAll<fileDocument>(databases, appwriteConfig.filesCollectionId, [
            Query.equal("ownerId", [drop.ownerId]),
            folderId ? Query.equal("folderId", [folderId]) : Query.isNull("folderId"),
            Query.isNull("trashedAt"),
            Query.select(["$id", "name"]),
        ])
        const taken = new Set(siblings.map((f) => f.name))
        const cleanName = cleanText(name, 255) || "Untitled"
        const finalName = taken.has(cleanName) ? nextFreeName(cleanName, taken) : cleanName
        const { type, extension } = getFileType(finalName)
        const smartInfo = sanitizeSmart(smart)
        const sender = cleanText(uploaderName, MAX_NAME) || "Someone"

        try {
            const doc = await databases.createDocument(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, ID.unique(), {
                type,
                extension,
                size: stored.sizeOriginal,
                url: constructFileUrl(bucketFileId),
                bucketField: bucketFileId,
                name: finalName,
                ownerId: drop.ownerId,
                accountId: drop.accountId,
                users: [],
                folderId,
                ...(smartInfo && { tags: smartInfo.tags, content: smartInfo.content }),
            })
            await logActivity(databases, { $id: drop.$id, fullName: `${sender} via drop link` }, {
                action: "upload", fileId: doc.$id, folderId, detail: { drop: drop.title },
            })
        } catch (error) {
            await discard()
            throw error
        }

        await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.dropsCollectionId, drop.$id, {
            filesReceived: drop.filesReceived + 1,
            lastReceivedAt: new Date().toISOString(),
        }).catch((error) => console.error("Failed to count drop upload", error))
        revalidateBrowser()
        revalidatePath("/drops")
        return { ok: true }
    } catch (error) {
        console.error("Failed to complete drop upload", error)
        return { ok: false, error: "Couldn't save the file" }
    }
}

// Deletes the bytes of a drop upload that was cancelled or failed before it was handed to the owner
export const discardDropUpload = async ({ code, bucketFileId }: { code: string, bucketFileId: string }): Promise<ActionResult> => {
    try {
        const { databases, storage } = await createAdminClient()
        const drop = await findDropByCode(databases, code)
        if (!drop) return { ok: true }
        const stored = await storage.getFile(appwriteConfig.bucketId, bucketFileId).catch((error) => {
            if (error instanceof AppwriteException && error.code === 404) return null
            throw error
        })
        // Bytes already handed over carry the owner's permissions instead, so they're never touched here
        if (!stored || !stored.$permissions.includes(`read("user:${drop.uploaderId}")`)) return { ok: true }
        await storage.deleteFile(appwriteConfig.bucketId, bucketFileId)
        return { ok: true }
    } catch (error) {
        console.error("Failed to discard drop upload", error)
        return { ok: false, error: "Couldn't remove the partial upload" }
    }
}
