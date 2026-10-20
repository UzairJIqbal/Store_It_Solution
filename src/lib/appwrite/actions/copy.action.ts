'use server'

// "Make a copy": new stored bytes and a new file document named "Copy of …". The copy belongs to the caller,
// so it counts against their storage. Copies of files shared with them land in their root folder.

import { ID, Permission, Query, Role } from "node-appwrite"
import { InputFile } from "node-appwrite/file"
import { createAdminClient } from ".."
import { appwriteConfig } from "../config"
import { constructFileUrl } from "@/lib/utils"
import { fileDocument } from "../../../../types"
import { STORAGE_LIMIT } from "../../../../constants"
import { ActionResult, listAll, revalidateBrowser } from "./shared"
import { AccessError, requireFileAccess } from "./access"
import { logActivity, storageUsedBy } from "./lifecycle"
import { nextFreeName } from "./names"

export const copyFile = async ({ fileId, path }: { fileId: string, path?: string }): Promise<ActionResult<{ fileId: string, name: string }>> => {
    try {
        const { file, role, user, databases } = await requireFileAccess(fileId, "viewer")
        const { storage } = await createAdminClient()
        const folderId = role === "owner" ? file.folderId ?? null : null

        const { used } = await storageUsedBy(databases, user.accountId)
        if (used + file.size > STORAGE_LIMIT) return { ok: false, error: "Not enough storage for a copy" }

        const siblings = await listAll<fileDocument>(databases, appwriteConfig.filesCollectionId, [
            Query.equal("ownerId", [user.$id]),
            folderId ? Query.equal("folderId", [folderId]) : Query.isNull("folderId"),
            Query.isNull("trashedAt"),
            Query.select(["$id", "name"]),
        ])
        const taken = new Set(siblings.map((f) => f.name))
        const wanted = `Copy of ${file.name}`.slice(0, 255)
        const name = taken.has(wanted) ? nextFreeName(wanted, taken) : wanted

        const bytes = await storage.getFileDownload(appwriteConfig.bucketId, file.bucketField)
        const owner = Role.user(user.accountId)
        const stored = await storage.createFile(appwriteConfig.bucketId, ID.unique(),
            InputFile.fromBuffer(Buffer.from(bytes), name),
            [Permission.read(owner), Permission.update(owner), Permission.delete(owner)])

        try {
            const doc = await databases.createDocument(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, ID.unique(), {
                type: file.type,
                extension: file.extension,
                size: stored.sizeOriginal,
                url: constructFileUrl(stored.$id),
                bucketField: stored.$id,
                name,
                ownerId: user.$id,
                accountId: user.accountId,
                users: [],
                folderId,
                tags: file.tags ?? [],
                content: file.content ?? null,
            })
            // The activity enum has no "copy"; an upload with copiedFrom reads as "made a copy of …"
            await logActivity(databases, user, {
                action: "upload", fileId: doc.$id, folderId, detail: { copiedFrom: file.name.slice(0, 255) },
            })
            revalidateBrowser(path)
            return { ok: true, data: { fileId: doc.$id, name } }
        } catch (error) {
            await storage.deleteFile(appwriteConfig.bucketId, stored.$id).catch(() => undefined)
            throw error
        }
    } catch (error) {
        if (error instanceof AccessError) return { ok: false, error: error.message }
        console.error("Failed to copy file", error)
        return { ok: false, error: "Couldn't make a copy" }
    }
}
