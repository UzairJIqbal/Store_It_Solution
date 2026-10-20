'use server'

import { randomBytes } from "crypto"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { ID, Models, Query } from "node-appwrite"
import { createAdminClient } from ".."
import { fileDocument, FileRole, FileType, GetFilesProps, LinkAccess, ShareDocument, ShareRole, UserDocument } from "../../../../types"
import { appwriteConfig } from "../config"
import { paresStringify } from "@/lib/utils"
import { getCurrentUser } from "./user.action"
import { STORAGE_LIMIT } from "../../../../constants"
import { ActionResult, chunk, Databases, listAll, ownerIdOf, PAGE_SIZE, requireUser } from "./shared"
import { attachStates, listVersionRows, logActivities, logActivity } from "./lifecycle"
import {
    AccessError, findShare, getSharedRoles, normalizeEmail, requireFileAccess, toClientFile,
} from "./access"
import { sendShareEmail } from "@/helpers/ShareEmail"

const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const MAX_RECIPIENTS = 50
const SHARE_ROLES: ShareRole[] = ["viewer", "editor"]

const errorMessage = (error: unknown, fallback: string) => error instanceof AccessError ? error.message : fallback

const revalidateSharing = (path?: string) => {
    if (path) revalidatePath(path)
    revalidatePath("/shared")
}

const listUsersByEmail = async (databases: Databases, emails: string[]) => {
    const users: UserDocument[] = []
    for (const batch of chunk(emails, PAGE_SIZE)) {
        users.push(...await listAll<UserDocument>(databases, appwriteConfig.userCollectionId, [Query.equal("email", batch)]))
    }
    return new Map(users.map((u) => [normalizeEmail(u.email), u]))
}

const listUsersById = async (databases: Databases, ids: string[]) => {
    const users: UserDocument[] = []
    for (const batch of chunk(ids, PAGE_SIZE)) {
        users.push(...await listAll<UserDocument>(databases, appwriteConfig.userCollectionId, [Query.equal("$id", batch)]))
    }
    return new Map(users.map((u) => [u.$id, u]))
}

// Owned files plus files shared with the caller. Shared ids go in as $id filters of at most 100 values each.
const createQueries = (userId: string, sharedIds: string[], types: string[], searchText: string, sort: string, limit: number | undefined) => {
    const owned = Query.equal("ownerId", [userId])
    const queries = [
        sharedIds.length > 0
            ? Query.or([owned, ...chunk(sharedIds, PAGE_SIZE).map((ids) => Query.equal("$id", ids))])
            : owned,
        Query.isNull("trashedAt"),
    ]
    if (types.length > 0) queries.push(Query.equal('type', types))
    if (searchText) queries.push(Query.contains('name', searchText))
    if (limit) queries.push(Query.limit(limit))

    const [sortBy, orderBy] = (sort || '$createdAt-desc').split("-")
    queries.push(orderBy === 'asc' ? Query.orderAsc(sortBy) : Query.orderDesc(sortBy))
    return queries
}

export const getFiles = async ({ types = [], searchText = '', sort = '$createdAt-desc', limit }: GetFilesProps) => {
    const { databases } = await createAdminClient()
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) throw new Error("User not Found")

        const sharedRoles = await getSharedRoles(databases, currentUser.email)
        const files = await databases.listDocuments(
            appwriteConfig.databaseId,
            appwriteConfig.filesCollectionId,
            createQueries(currentUser.$id, [...sharedRoles.keys()], types, searchText, sort, limit)
        )

        const withStates = await attachStates(databases, currentUser.$id, files.documents as unknown as fileDocument[])
        const documents = withStates.map((file) =>
            toClientFile(file, ownerIdOf(file) === currentUser.$id ? "owner" : sharedRoles.get(file.$id) ?? "viewer"))
        return paresStringify({ total: files.total, documents })
    } catch (error: any) {
        console.error("Error in Getting Files", error);
    }
}

export const renameFile = async ({ fileId, name, extension, path }: { fileId: string, name: string, extension: string, path: string }) => {
    try {
        const { file, user, databases } = await requireFileAccess(fileId, "editor")
        const newName = `${name}.${extension}`
        const updateFile = await databases.updateDocument(
            appwriteConfig.databaseId,
            appwriteConfig.filesCollectionId,
            fileId,
            { name: newName }
        )
        if (newName !== file.name) {
            await logActivity(databases, user, { action: "rename", fileId, folderId: file.folderId, detail: { from: file.name, to: newName } })
        }
        revalidateSharing(path)
        return paresStringify({ $id: updateFile.$id, name: updateFile.name })
    } catch (error: any) {
        console.log("The error to rename the file is this", error);
        throw new Error("Failed to rename the file");
    }
}

export type SharingPerson = {
    email: string,
    role: FileRole,
    name: string | null,
    avatar: string | null,
    hasAccount: boolean,
    isMe: boolean,
}

export type FileSharing = {
    fileId: string,
    fileName: string,
    myRole: FileRole,
    people: SharingPerson[],
    linkAccess: LinkAccess,
    // The link to copy: the public /s/ page when the link is on, otherwise the app link people with access can open
    link: string,
}

// Everything the share dialog shows. Anyone with access can see who else has it.
export const getFileSharing = async ({ fileId }: { fileId: string }): Promise<ActionResult<FileSharing>> => {
    try {
        const { file, role, user, databases } = await requireFileAccess(fileId, "viewer")
        const shares = await listAll<ShareDocument>(databases, appwriteConfig.sharesCollectionId, [
            Query.equal("fileId", [fileId]),
            Query.orderAsc("$createdAt"),
        ])
        const ownerId = ownerIdOf(file)!
        const owner = typeof file.ownerId === "object" ? file.ownerId : (await listUsersById(databases, [ownerId])).get(ownerId)
        const accounts = await listUsersByEmail(databases, shares.map((s) => s.email))
        const me = normalizeEmail(user.email)

        const people: SharingPerson[] = [
            {
                email: owner?.email ?? "", role: "owner", name: owner?.fullName ?? null, avatar: owner?.avatar ?? null,
                hasAccount: true, isMe: ownerId === user.$id,
            },
            ...shares.map((s) => {
                const account = accounts.get(s.email)
                return {
                    email: s.email, role: s.role, name: account?.fullName ?? null, avatar: account?.avatar ?? null,
                    hasAccount: Boolean(account), isMe: s.email === me,
                }
            }),
        ]

        const linkAccess = file.linkAccess === "anyone" && file.linkToken ? "anyone" : "restricted"
        return {
            ok: true,
            data: paresStringify({
                fileId,
                fileName: file.name,
                myRole: role,
                people,
                linkAccess,
                link: linkAccess === "anyone" ? `/s/${file.linkToken}` : `/api/files/${fileId}`,
            }),
        }
    } catch (error) {
        console.error("Failed to load sharing", error)
        return { ok: false, error: errorMessage(error, "Couldn't load sharing") }
    }
}

const appOrigin = async () => {
    const h = await headers()
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https")
    return `${proto}://${host}`
}

// Editors and the owner can add people as viewers or editors
export const shareFile = async ({ fileId, emails, role, notify, message, path }: {
    fileId: string,
    emails: string[],
    role: ShareRole,
    notify: boolean,
    message?: string,
    path?: string,
}): Promise<ActionResult<{ added: string[], alreadyHadAccess: string[], notified: number }>> => {
    try {
        if (!SHARE_ROLES.includes(role)) return { ok: false, error: "Choose Viewer or Editor" }
        const cleaned = [...new Set(emails.map(normalizeEmail).filter(Boolean))]
        if (cleaned.length === 0) return { ok: false, error: "Add at least one email address" }
        if (cleaned.length > MAX_RECIPIENTS) return { ok: false, error: `You can add up to ${MAX_RECIPIENTS} people at once` }
        const invalid = cleaned.filter((e) => e.length > 320 || !EMAIL_PATTERN.test(e))
        if (invalid.length > 0) return { ok: false, error: `Not a valid email: ${invalid[0]}` }

        const { file, user, databases } = await requireFileAccess(fileId, "editor")
        const ownerId = ownerIdOf(file)!
        const owner = typeof file.ownerId === "object" ? file.ownerId : null
        const ownerEmail = normalizeEmail(owner?.email ?? (ownerId === user.$id ? user.email : ""))

        const added: string[] = []
        const alreadyHadAccess: string[] = []
        for (const email of cleaned) {
            if (email === ownerEmail || await findShare(databases, fileId, email)) {
                alreadyHadAccess.push(email)
                continue
            }
            try {
                await databases.createDocument(appwriteConfig.databaseId, appwriteConfig.sharesCollectionId, ID.unique(), {
                    fileId, ownerId, email, role, sharedBy: user.$id,
                })
                added.push(email)
            } catch (error: any) {
                // The unique (fileId, email) index catches a concurrent add
                if (error?.code !== 409) throw error
                alreadyHadAccess.push(email)
            }
        }

        let notified = 0
        if (notify && added.length > 0) {
            const url = `${await appOrigin()}/shared`
            const note = message?.trim().slice(0, 1000) || undefined
            const results = await Promise.all(added.map((to) => sendShareEmail({
                to, sharerName: user.fullName, fileName: file.name, role, message: note, url,
            })))
            notified = results.filter(Boolean).length
        }

        await logActivities(databases, user, added.map((email) => ({
            action: "share" as const, fileId, folderId: file.folderId, detail: { email, role },
        })))
        revalidateSharing(path)
        return { ok: true, data: { added, alreadyHadAccess, notified } }
    } catch (error) {
        console.error("Failed to share file", error)
        return { ok: false, error: errorMessage(error, "Couldn't share the file") }
    }
}

// Viewer <-> editor. Editors can change other people's roles too; the owner's role only changes by transfer.
export const updateShareRole = async ({ fileId, email, role, path }: {
    fileId: string, email: string, role: ShareRole, path?: string,
}): Promise<ActionResult> => {
    try {
        if (!SHARE_ROLES.includes(role)) return { ok: false, error: "Choose Viewer or Editor" }
        const { file, user, databases } = await requireFileAccess(fileId, "editor")
        const share = await findShare(databases, fileId, email)
        if (!share) return { ok: false, error: "That person doesn't have access" }
        await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.sharesCollectionId, share.$id, { role })
        if (share.role !== role) {
            await logActivity(databases, user, { action: "role", fileId, folderId: file.folderId, detail: { email: share.email, role } })
        }
        revalidateSharing(path)
        return { ok: true }
    } catch (error) {
        console.error("Failed to change role", error)
        return { ok: false, error: errorMessage(error, "Couldn't change the role") }
    }
}

// The owner can remove anyone; anyone can remove their own access
export const removeShare = async ({ fileId, email, path }: { fileId: string, email: string, path?: string }): Promise<ActionResult> => {
    try {
        const { file, role, user, databases } = await requireFileAccess(fileId, "viewer")
        const target = normalizeEmail(email)
        if (role !== "owner" && target !== normalizeEmail(user.email)) throw new AccessError()
        const share = await findShare(databases, fileId, target)
        if (!share) return { ok: false, error: "That person doesn't have access" }
        await databases.deleteDocument(appwriteConfig.databaseId, appwriteConfig.sharesCollectionId, share.$id)
        await logActivity(databases, user, { action: "unshare", fileId, folderId: file.folderId, detail: { email: target } })
        revalidateSharing(path)
        return { ok: true }
    } catch (error) {
        console.error("Failed to remove access", error)
        return { ok: false, error: errorMessage(error, "Couldn't remove access") }
    }
}

// Turning the link on makes a new unguessable token; turning it off clears it, so old links stop working
export const setLinkAccess = async ({ fileId, access, path }: {
    fileId: string, access: LinkAccess, path?: string,
}): Promise<ActionResult<{ link: string }>> => {
    try {
        if (access !== "anyone" && access !== "restricted") return { ok: false, error: "Unknown link setting" }
        const { file, user, databases } = await requireFileAccess(fileId, "owner")
        const wasOn = file.linkAccess === "anyone" && Boolean(file.linkToken)
        const token = access === "anyone" ? (file.linkAccess === "anyone" && file.linkToken) || randomBytes(32).toString("base64url") : null
        await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, fileId, {
            linkAccess: access,
            linkToken: token,
        })
        if (wasOn !== (access === "anyone")) {
            await logActivity(databases, user, { action: "link", fileId, folderId: file.folderId, detail: { access } })
        }
        revalidateSharing(path)
        return { ok: true, data: { link: token ? `/s/${token}` : `/api/files/${fileId}` } }
    } catch (error) {
        console.error("Failed to change link access", error)
        return { ok: false, error: errorMessage(error, "Couldn't change link access") }
    }
}

// The new owner must already have access and a StoreIt account. The old owner stays on as an editor.
export const transferOwnership = async ({ fileId, email, path }: { fileId: string, email: string, path?: string }): Promise<ActionResult> => {
    try {
        const { file, user, databases } = await requireFileAccess(fileId, "owner")
        const target = normalizeEmail(email)
        const share = await findShare(databases, fileId, target)
        if (!share) return { ok: false, error: "Share the file with them first" }
        const newOwner = (await listUsersByEmail(databases, [target])).get(target)
        if (!newOwner) return { ok: false, error: "They need a StoreIt account before they can own files" }

        // The file leaves the old owner's folders and lands in the new owner's root
        await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, fileId, {
            ownerId: newOwner.$id,
            accountId: newOwner.accountId,
            folderId: null,
        })
        await databases.deleteDocument(appwriteConfig.databaseId, appwriteConfig.sharesCollectionId, share.$id)
        await databases.createDocument(appwriteConfig.databaseId, appwriteConfig.sharesCollectionId, ID.unique(), {
            fileId, ownerId: newOwner.$id, email: normalizeEmail(user.email), role: "editor", sharedBy: newOwner.$id,
        })
        const others = await listAll<ShareDocument>(databases, appwriteConfig.sharesCollectionId, [Query.equal("fileId", [fileId])])
        await Promise.all(others.filter((s) => s.ownerId !== newOwner.$id).map((s) =>
            databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.sharesCollectionId, s.$id, { ownerId: newOwner.$id })))
        await logActivity(databases, user, { action: "transfer", fileId, folderId: file.folderId, detail: { email: target } })

        revalidateSharing(path)
        revalidatePath("/files")
        return { ok: true }
    } catch (error) {
        console.error("Failed to transfer ownership", error)
        return { ok: false, error: errorMessage(error, "Couldn't transfer ownership") }
    }
}

// Autocomplete for the share dialog: people the caller has shared with before, most recent first
export const getShareSuggestions = async (): Promise<string[]> => {
    const user = await requireUser()
    const { databases } = await createAdminClient()
    const recent = await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.sharesCollectionId, [
        Query.equal("sharedBy", [user.$id]),
        Query.orderDesc("$createdAt"),
        Query.limit(PAGE_SIZE),
    ])
    return [...new Set((recent.documents as unknown as ShareDocument[]).map((s) => s.email))].slice(0, 20)
}

export type SharedItem = {
    file: fileDocument,
    sharedBy: { name: string, email: string, avatar: string | null },
    sharedAt: string,
}

// "Shared with me": newest share first
export const getSharedWithMe = async (): Promise<SharedItem[]> => {
    const user = await requireUser()
    const { databases } = await createAdminClient()
    const shares = await listAll<ShareDocument>(databases, appwriteConfig.sharesCollectionId, [
        Query.equal("email", [normalizeEmail(user.email)]),
        Query.orderDesc("$createdAt"),
    ])
    if (shares.length === 0) return []

    const files = new Map<string, fileDocument>()
    for (const ids of chunk(shares.map((s) => s.fileId), PAGE_SIZE)) {
        const docs = await listAll<fileDocument>(databases, appwriteConfig.filesCollectionId, [Query.equal("$id", ids)])
        docs.forEach((f) => files.set(f.$id, f))
    }
    const sharers = await listUsersById(databases, [...new Set(shares.map((s) => s.sharedBy))])

    return paresStringify(shares.flatMap((s) => {
        const file = files.get(s.fileId)
        if (!file || file.trashedAt) return []
        const sharer = sharers.get(s.sharedBy)
        return [{
            file: toClientFile(file, s.role),
            sharedBy: { name: sharer?.fullName ?? "Unknown", email: sharer?.email ?? "", avatar: sharer?.avatar ?? null },
            sharedAt: s.$createdAt,
        }]
    }))
}

export const getTotalSpaceUsed = async () => {
    try {
        const { databases } = await createAdminClient()
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            throw new Error("User is not authenticated");
        }
        // Only owned files count towards the user's storage: trashed ones too, and every old version, until they're
        // permanently deleted
        const documents = await listAll<Models.DefaultDocument>(databases, appwriteConfig.filesCollectionId, [
            Query.equal("ownerId", [currentUser.$id]),
        ])
        const typeOf = new Map(documents.map((f) => [f.$id, f.type as FileType]))
        const versions = await listVersionRows(databases, documents.map((f) => f.$id))

        const totalSpace = {
            image: { size: 0, latestDate: "" },
            document: { size: 0, latestDate: "" },
            audio: { size: 0, latestDate: "" },
            video: { size: 0, latestDate: "" },
            other: { size: 0, latestDate: "" },
            used: 0,
            all: STORAGE_LIMIT
        }

        documents.forEach((file) => {
            const fileType = file.type as FileType;
            totalSpace[fileType].size += file.size;
            totalSpace.used += file.size
            if (!totalSpace[fileType].latestDate || new Date(file.$updatedAt) > new Date(totalSpace[fileType].latestDate)) {
                totalSpace[fileType].latestDate = file.$updatedAt
            }
        })
        versions.forEach((version) => {
            totalSpace[typeOf.get(version.fileId) ?? "other"].size += version.size
            totalSpace.used += version.size
        })

        return paresStringify(totalSpace)

    } catch (error: any) {
        console.error("Error in updating your total space", error);

    }
}
