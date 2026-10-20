// Per-file roles (docs/sharing-research/plan.md). Not a 'use server' file: these helpers take a databases client
// and must never be callable from the browser. Every file action checks access through here.
import { Query } from "node-appwrite"
import { createAdminClient } from ".."
import { appwriteConfig } from "../config"
import { fileViewUrl } from "@/lib/utils"
import { fileDocument, FileRole, ShareDocument, UserDocument } from "../../../../types"
import { Databases, listAll, ownerIdOf, requireUser } from "./shared"

export const RANK: Record<FileRole, number> = { viewer: 1, editor: 2, owner: 3 }

export class AccessError extends Error {
    constructor(message = "Not allowed") {
        super(message)
        this.name = "AccessError"
    }
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

type Caller = Pick<UserDocument, "$id" | "email">

export const findShare = async (databases: Databases, fileId: string, email: string) => {
    const result = await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.sharesCollectionId, [
        Query.equal("fileId", [fileId]),
        Query.equal("email", [normalizeEmail(email)]),
        Query.limit(1),
    ])
    return (result.documents[0] as unknown as ShareDocument | undefined) ?? null
}

// The caller's role on a file, or null: owner from files.ownerId, otherwise their shares row
export const getFileRole = async (databases: Databases, file: fileDocument, user: Caller): Promise<FileRole | null> => {
    if (ownerIdOf(file) === user.$id) return "owner"
    return (await findShare(databases, file.$id, user.email))?.role ?? null
}

export const getFileDocument = async (databases: Databases, fileId: string) => {
    try {
        return await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, fileId) as unknown as fileDocument
    } catch {
        return null
    }
}

// Loads the file and throws AccessError unless the caller's role is at least `min`.
// A file the caller can't see at all reports the same error as a missing one, so ids can't be probed.
// A trashed file is missing for everyone; only its owner can reach it, and only where allowTrashed says so.
export const requireFileAccess = async (fileId: string, min: FileRole, { allowTrashed = false } = {}) => {
    const user = await requireUser()
    const { databases } = await createAdminClient()
    const file = await getFileDocument(databases, fileId)
    const role = file ? await getFileRole(databases, file, user) : null
    if (!file || !role) throw new AccessError("File not found")
    if (file.trashedAt && !(allowTrashed && role === "owner")) throw new AccessError("File not found")
    if (RANK[role] < RANK[min]) throw new AccessError()
    return { file, role, user, databases }
}

// For /s/[token]: the file when its link is on and the token matches. No sign-in needed.
export const getFileByLinkToken = async (token: string) => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
    const { databases } = await createAdminClient()
    const result = await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, [
        Query.equal("linkToken", [token]),
        Query.limit(1),
    ])
    const file = result.documents[0] as unknown as fileDocument | undefined
    return file && !file.trashedAt && file.linkAccess === "anyone" && file.linkToken === token ? file : null
}

// Ids of every file shared with this email, with the role on each
export const getSharedRoles = async (databases: Databases, email: string) => {
    const shares = await listAll<ShareDocument>(databases, appwriteConfig.sharesCollectionId, [
        Query.equal("email", [normalizeEmail(email)]),
    ])
    return new Map(shares.map((s) => [s.fileId, s.role]))
}

// What the browser gets for a file: the served URL instead of the storage URL, the caller's role, and only the
// owner's public profile. The expanded owner document also holds their sign-in code, which must never leave the server.
export const toClientFile = (file: fileDocument, role: FileRole) => {
    const owner = (typeof file.ownerId === "object" && file.ownerId ? file.ownerId : null) as UserDocument | null
    // content can be 10,000 characters per file; lists never need it
    const { users: _users, linkToken: _linkToken, content: _content, ...rest } = file
    return {
        ...rest,
        url: fileViewUrl(file.$id),
        role,
        ownerId: owner
            ? { $id: owner.$id, fullName: owner.fullName, email: owner.email, avatar: owner.avatar }
            : { $id: ownerIdOf(file), fullName: "", email: "", avatar: "" },
    } as unknown as fileDocument
}
