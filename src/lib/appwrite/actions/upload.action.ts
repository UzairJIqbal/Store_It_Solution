'use server'

// Browsers upload file bytes straight to the Appwrite bucket in chunks. These actions handle what needs the
// admin key: short-lived upload credentials, checks before the upload, and the file document after it.

import { AppwriteException, ID, Query } from "node-appwrite"
import { createAdminClient } from ".."
import { appwriteConfig } from "../config"
import { constructFileUrl, getFileType } from "@/lib/utils"
import { fileDocument, FileVersionDocument } from "../../../../types"
import { MAX_FILE_SIZE, STORAGE_LIMIT } from "../../../../constants"
import { ActionResult, chunk, getOwnedFolder, listAll, ownerIdOf, requireUser, revalidateBrowser } from "./shared"
import { AccessError, requireFileAccess } from "./access"
import { sanitizeSmart } from "@/lib/smart/sanitize"
import { nextFreeName } from "./names"
import { currentUploader, getPurger, listVersionRows, logActivity, MAX_OLD_VERSIONS, storageUsedBy } from "./lifecycle"

type User = Awaited<ReturnType<typeof requireUser>>
type Admin = Awaited<ReturnType<typeof createAdminClient>>

export interface PrepareUploadFile {
    key: string,
    name: string,
    size: number,
    // Folder path inside a dropped folder ("photos/2024"), or "" for a file dropped on its own
    dir: string,
}

export interface UploadClash {
    existingFileId: string,
    // The first "name (n).ext" that is free in the target folder
    freeName: string,
}

export interface PreparedUpload {
    jwt: string,
    // Dropped folder path → the StoreIt folder created for it ("" → the target folder)
    folderIds: Record<string, string | null>,
    clashes: Record<string, UploadClash>,
}

const JWT_SECONDS = 15 * 60

// StoreIt signs users in with its own cookie, so an Appwrite Auth user (same id as accountId) is created
// the first time someone uploads; it only exists to mint upload JWTs
const createAuthUser = async ({ users }: Admin, user: User) => {
    try {
        await users.create(user.accountId, user.email, undefined, undefined, user.fullName)
    } catch (error) {
        // The email may already belong to another Auth user; the email isn't needed for JWTs
        if (error instanceof AppwriteException && error.code === 409) {
            await users.create(user.accountId, undefined, undefined, undefined, user.fullName)
        } else throw error
    }
}

// Each Appwrite call is a round trip to Frankfurt, so try the JWT first and create the Auth user only if it's missing
const mintJwt = async (admin: Admin, user: User) => {
    const create = () => admin.users.createJWT(user.accountId, undefined, JWT_SECONDS)
    try {
        return (await create()).jwt
    } catch (error) {
        if (!(error instanceof AppwriteException) || error.code !== 404) throw error
        await createAuthUser(admin, user)
        return (await create()).jwt
    }
}

const ownsStoredFile = (permissions: string[], accountId: string) =>
    permissions.includes(`read("user:${accountId}")`)

export const prepareUpload = async ({ targetFolderId, files, dirs, path }: {
    targetFolderId: string | null,
    files: PrepareUploadFile[],
    // Every folder path in the drop, including empty folders
    dirs: string[],
    path: string,
}): Promise<ActionResult<PreparedUpload>> => {
    try {
        const user = await requireUser()
        const admin = await createAdminClient()
        const { databases } = admin

        if (files.some((f) => f.size > MAX_FILE_SIZE)) return { ok: false, error: "Files must be 50 MB or smaller" }

        // Minted alongside the checks; it's simply unused if they fail
        const jwtPromise = mintJwt(admin, user)
        jwtPromise.catch(() => undefined)

        const [target, ownedFiles] = await Promise.all([
            targetFolderId ? getOwnedFolder(databases, targetFolderId, user.$id) : null,
            listAll<fileDocument>(databases, appwriteConfig.filesCollectionId, [
                Query.equal("ownerId", [user.$id]),
                Query.select(["$id", "name", "size", "folderId", "trashedAt"]),
            ]),
        ])
        if (targetFolderId && !target) return { ok: false, error: "The folder you're uploading to no longer exists" }

        // Trashed files and old versions still take up space until they're permanently deleted
        const versions = await listVersionRows(databases, ownedFiles.map((f) => f.$id))
        const used = ownedFiles.reduce((sum, f) => sum + f.size, 0) + versions.reduce((sum, v) => sum + v.size, 0)
        const incoming = files.reduce((sum, f) => sum + f.size, 0)
        if (used + incoming > STORAGE_LIMIT) {
            return { ok: false, error: "Not enough storage left for these files" }
        }

        // Only files dropped straight into the target can clash; dropped folders are always created new
        const clashes: Record<string, UploadClash> = {}
        const inTarget = ownedFiles.filter((f) => !f.trashedAt && (f.folderId ?? null) === targetFolderId)
        const taken = new Set(inTarget.map((f) => f.name))
        for (const f of files.filter((f) => f.dir === "")) {
            const existing = inTarget.find((e) => e.name === f.name)
            if (!existing) continue
            const freeName = nextFreeName(f.name, taken)
            taken.add(freeName)
            clashes[f.key] = { existingFileId: existing.$id, freeName }
        }

        // Create the dropped folder tree parent-first; folders at the same depth are created together
        const folderIds: Record<string, string | null> = { "": targetFolderId }
        const ancestorsOf: Record<string, string[]> = { "": target ? [...target.ancestors, target.$id] : [] }
        const allDirs = new Set<string>()
        for (const dir of [...dirs, ...files.map((f) => f.dir)]) {
            const parts = dir.split("/").filter(Boolean)
            parts.forEach((_, i) => allDirs.add(parts.slice(0, i + 1).join("/")))
        }
        const byDepth = [...allDirs].sort((a, b) => a.split("/").length - b.split("/").length)
        let depth = 0
        while (byDepth.length > 0) {
            depth++
            const level = byDepth.filter((d) => d.split("/").length === depth)
            byDepth.splice(0, level.length)
            for (const batch of chunk(level, 10)) {
                await Promise.all(batch.map(async (dir) => {
                    const parentDir = dir.split("/").slice(0, -1).join("/")
                    const folder = await databases.createDocument(appwriteConfig.databaseId, appwriteConfig.foldersCollectionId, ID.unique(), {
                        name: dir.split("/").pop()!.slice(0, 255),
                        parentId: folderIds[parentDir],
                        ancestors: ancestorsOf[parentDir],
                        ownerId: user.$id,
                        accountId: user.accountId,
                        users: [],
                    })
                    folderIds[dir] = folder.$id
                    ancestorsOf[dir] = [...ancestorsOf[parentDir], folder.$id]
                }))
            }
        }
        if (allDirs.size > 0) revalidateBrowser(path)

        const jwt = await jwtPromise
        return { ok: true, data: { jwt, folderIds, clashes } }
    } catch (error) {
        console.error("Failed to prepare upload", error)
        return { ok: false, error: "Couldn't start the upload" }
    }
}

// Upload JWTs last 15 minutes; the browser asks for a new one when Appwrite answers 401
export const refreshUploadToken = async (): Promise<ActionResult<string>> => {
    try {
        const user = await requireUser()
        return { ok: true, data: await mintJwt(await createAdminClient(), user) }
    } catch (error) {
        console.error("Failed to refresh upload token", error)
        return { ok: false, error: "Your session has expired. Sign in again to keep uploading." }
    }
}

// "Upload new version": editors and the owner can replace a file's bytes. The new bytes count towards the owner's storage.
export const prepareVersionUpload = async ({ fileId, size }: { fileId: string, size: number }): Promise<ActionResult<string>> => {
    try {
        if (!(size > 0)) return { ok: false, error: "The file is empty" }
        if (size > MAX_FILE_SIZE) return { ok: false, error: "Files must be 50 MB or smaller" }
        const { file, user } = await requireFileAccess(fileId, "editor")
        const admin = await createAdminClient()
        const { used } = await storageUsedBy(admin.databases, file.accountId)
        if (used + size > STORAGE_LIMIT) return { ok: false, error: "The owner doesn't have enough storage left" }
        return { ok: true, data: await mintJwt(admin, user) }
    } catch (error) {
        console.error("Failed to prepare version upload", error)
        return { ok: false, error: error instanceof AccessError ? error.message : "Couldn't start the upload" }
    }
}

// The current bytes become an old version row; past MAX_OLD_VERSIONS the oldest one is permanently deleted
// Keeps the current bytes as an old version row. Returns the row so a failed swap can take it back.
const archiveCurrentVersion = async (databases: Admin["databases"], file: fileDocument) =>
    databases.createDocument(appwriteConfig.databaseId, appwriteConfig.fileVersionsCollectionId, ID.unique(), {
        fileId: file.$id,
        bucketFileId: file.bucketField,
        name: file.name,
        size: file.size,
        extension: file.extension || null,
        uploadedBy: await currentUploader(databases, file),
        uploadedAt: file.currentVersionAt ?? file.$createdAt,
        number: file.versionCount ?? 1,
    })

// Keeps at most MAX_OLD_VERSIONS old versions, dropping the oldest. Runs after the swap, so it never touches
// the bytes the file now points to.
const pruneOldVersions = async (databases: Admin["databases"], fileId: string) => {
    const old = await listAll<FileVersionDocument>(databases, appwriteConfig.fileVersionsCollectionId, [
        Query.equal("fileId", [fileId]),
        Query.orderAsc("number"),
    ])
    const purger = await getPurger()
    for (const version of old.slice(0, Math.max(0, old.length - MAX_OLD_VERSIONS))) {
        await purger.purgeVersion(version)
    }
}

export const completeUpload = async ({ bucketFileId, folderId, name, replaceFileId, path, smart }: {
    bucketFileId: string,
    folderId: string | null,
    name: string,
    replaceFileId?: string,
    path: string,
    // Tags and text worked out in the browser (src/lib/smart/analyze.ts)
    smart?: { tags: string[], content: string | null },
}): Promise<ActionResult<{ fileId: string }>> => {
    try {
        const user = await requireUser()
        const { databases, storage } = await createAdminClient()

        const [stored, folderExists] = await Promise.all([
            storage.getFile(appwriteConfig.bucketId, bucketFileId),
            !replaceFileId && folderId ? getOwnedFolder(databases, folderId, user.$id).then(Boolean) : true,
        ])
        if (!ownsStoredFile(stored.$permissions, user.accountId)) return { ok: false, error: "Upload not found" }
        if (stored.chunksUploaded !== stored.chunksTotal) return { ok: false, error: "The upload didn't finish" }

        const discard = () => storage.deleteFile(appwriteConfig.bucketId, bucketFileId).catch(() => undefined)
        const { type, extension } = getFileType(name)
        const stats = {
            type,
            extension,
            size: stored.sizeOriginal,
            url: constructFileUrl(bucketFileId),
            bucketField: bucketFileId,
        }
        const smartInfo = sanitizeSmart(smart)

        if (replaceFileId) {
            // A new version keeps the document (its id, name, type, location and sharing) and swaps in the new bytes.
            // The old bytes are kept as a version row.
            const existing = await requireFileAccess(replaceFileId, "editor").then((access) => access.file).catch(() => null)
            if (!existing) {
                await discard()
                return { ok: false, error: "The file you're replacing no longer exists" }
            }
            if (existing.bucketField === bucketFileId) return { ok: true, data: { fileId: existing.$id } }
            const archived = await archiveCurrentVersion(databases, existing).catch(async (error) => {
                await discard()
                throw error
            })
            try {
                await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, existing.$id, {
                    size: stored.sizeOriginal,
                    url: constructFileUrl(bucketFileId),
                    bucketField: bucketFileId,
                    versionCount: (existing.versionCount ?? 1) + 1,
                    currentVersionAt: new Date().toISOString(),
                    // The new bytes get their own tags; with none sent, the old ones would describe the wrong content
                    tags: smartInfo?.tags ?? [],
                    content: smartInfo?.content ?? null,
                })
            } catch (error) {
                // The file still points at its old bytes: drop the row that called them an old version
                await databases.deleteDocument(appwriteConfig.databaseId, appwriteConfig.fileVersionsCollectionId, archived.$id).catch(() => undefined)
                await discard()
                throw error
            }
            await pruneOldVersions(databases, existing.$id).catch((error) => console.error("Failed to prune old versions", error))
            await logActivity(databases, user, {
                action: "version", fileId: existing.$id, folderId: existing.folderId,
                detail: { number: (existing.versionCount ?? 1) + 1, uploadedName: name.slice(0, 255) },
            })
            revalidateBrowser(path)
            return { ok: true, data: { fileId: existing.$id } }
        }

        if (!folderExists) {
            await discard()
            return { ok: false, error: "The folder you're uploading to no longer exists" }
        }

        try {
            const doc = await databases.createDocument(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, ID.unique(), {
                ...stats,
                name: name.slice(0, 255),
                ownerId: user.$id,
                accountId: user.accountId,
                users: [],
                folderId,
                ...(smartInfo && { tags: smartInfo.tags, content: smartInfo.content }),
            })
            await logActivity(databases, user, { action: "upload", fileId: doc.$id, folderId })
            revalidateBrowser(path)
            return { ok: true, data: { fileId: doc.$id } }
        } catch (error) {
            await discard()
            throw error
        }
    } catch (error) {
        console.error("Failed to complete upload", error)
        return { ok: false, error: "Couldn't save the file" }
    }
}

// Deletes the stored bytes of an upload that was cancelled or failed before it got a file document
export const discardUpload = async ({ bucketFileId }: { bucketFileId: string }): Promise<ActionResult> => {
    try {
        const user = await requireUser()
        const { databases, storage } = await createAdminClient()
        const stored = await storage.getFile(appwriteConfig.bucketId, bucketFileId).catch((error) => {
            if (error instanceof AppwriteException && error.code === 404) return null
            throw error
        })
        if (!stored) return { ok: true }
        if (!ownsStoredFile(stored.$permissions, user.accountId)) return { ok: false, error: "Upload not found" }

        // Never delete bytes that a file document already points to
        const linked = await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, [
            Query.equal("bucketField", [bucketFileId]),
            Query.limit(1),
        ])
        if (linked.total > 0) return { ok: true }
        const versioned = await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.fileVersionsCollectionId, [
            Query.equal("bucketFileId", [bucketFileId]),
            Query.limit(1),
        ])
        if (versioned.total > 0) return { ok: true }

        await storage.deleteFile(appwriteConfig.bucketId, bucketFileId)
        return { ok: true }
    } catch (error) {
        console.error("Failed to discard upload", error)
        return { ok: false, error: "Couldn't remove the partial upload" }
    }
}
