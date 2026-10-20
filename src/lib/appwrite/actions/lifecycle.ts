// Helpers for star/recent state, the activity log, versions and purging (docs/lifecycle-research/plan.md).
// Not a 'use server' file: these take a databases client and must never be callable from the browser.
import { ID, Query } from "node-appwrite"
import { createAdminClient } from ".."
import { appwriteConfig } from "../config"
import {
    ActivityAction, ActivityDocument, FileStateDocument, FileVersionDocument, fileDocument, UserDocument,
} from "../../../../types"
import { chunk, Databases, listAll, ownerIdOf, PAGE_SIZE } from "./shared"
// Shared with the daily cleanup Function, so "Delete forever" removes exactly what the Function would
import { createPurger } from "../../../../functions/lifecycle-cleanup/src/purge.js"

export { MAX_OLD_VERSIONS, TRASH_DAYS } from "../../../../functions/lifecycle-cleanup/src/purge.js"

type Actor = Pick<UserDocument, "$id" | "fullName">

// Appends one activity row. Logging never fails the change it describes.
export const logActivity = async (databases: Databases, actor: Actor, entry: {
    action: ActivityAction,
    fileId?: string | null,
    folderId?: string | null,
    detail?: Record<string, unknown>,
}) => {
    try {
        await databases.createDocument(appwriteConfig.databaseId, appwriteConfig.activityCollectionId, ID.unique(), {
            fileId: entry.fileId ?? null,
            folderId: entry.folderId ?? null,
            actorId: actor.$id,
            actorName: (actor.fullName || "Someone").slice(0, 255),
            action: entry.action,
            detail: entry.detail ? JSON.stringify(entry.detail).slice(0, 1000) : null,
        })
    } catch (error) {
        console.error("Failed to log activity", entry.action, error)
    }
}

export const logActivities = (databases: Databases, actor: Actor, entries: Parameters<typeof logActivity>[2][]) =>
    Promise.all(entries.map((entry) => logActivity(databases, actor, entry)))

// The caller's star / last-opened rows for these files
export const getStates = async (databases: Databases, userId: string, fileIds: string[]) => {
    const states = new Map<string, FileStateDocument>()
    for (const ids of chunk([...new Set(fileIds)], PAGE_SIZE)) {
        const rows = await listAll<FileStateDocument>(databases, appwriteConfig.fileStatesCollectionId, [
            Query.equal("userId", [userId]),
            Query.equal("fileId", ids),
        ])
        rows.forEach((row) => states.set(row.fileId, row))
    }
    return states
}

export const attachStates = async <T extends fileDocument>(databases: Databases, userId: string, files: T[]) => {
    if (files.length === 0) return files
    const states = await getStates(databases, userId, files.map((f) => f.$id))
    return files.map((file) => {
        const state = states.get(file.$id)
        return { ...file, isStarred: state?.isStarred ?? false, lastOpenedAt: state?.lastOpenedAt ?? null }
    })
}

// Creates or updates the caller's row for a file. The unique (userId, fileId) index settles a race between two tabs.
export const upsertState = async (databases: Databases, userId: string, fileId: string,
    data: Partial<Pick<FileStateDocument, "isStarred" | "starredAt" | "lastOpenedAt">>) => {
    const find = async () => (await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.fileStatesCollectionId, [
        Query.equal("userId", [userId]),
        Query.equal("fileId", [fileId]),
        Query.limit(1),
    ])).documents[0]
    const existing = await find()
    if (existing) {
        return databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.fileStatesCollectionId, existing.$id, data)
    }
    try {
        return await databases.createDocument(appwriteConfig.databaseId, appwriteConfig.fileStatesCollectionId, ID.unique(), {
            userId, fileId, ...data,
        })
    } catch (error: any) {
        if (error?.code !== 409) throw error
        const row = await find()
        return databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.fileStatesCollectionId, row!.$id, data)
    }
}

export const listVersionRows = (databases: Databases, fileIds: string[]) =>
    Promise.all(chunk(fileIds, PAGE_SIZE).map((ids) => listAll<FileVersionDocument>(
        databases, appwriteConfig.fileVersionsCollectionId, [Query.equal("fileId", ids)],
    ))).then((pages) => pages.flat())

// Bytes a user's storage holds: their files, trashed ones included, plus every old version of them
export const storageUsedBy = async (databases: Databases, accountId: string) => {
    const files = await listAll<fileDocument>(databases, appwriteConfig.filesCollectionId, [
        Query.equal("accountId", [accountId]),
        Query.select(["$id", "size", "type"]),
    ])
    const versions = await listVersionRows(databases, files.map((f) => f.$id))
    return { files, versions, used: files.reduce((s, f) => s + f.size, 0) + versions.reduce((s, v) => s + v.size, 0) }
}

export const purgeIds = () => ({
    databaseId: appwriteConfig.databaseId,
    bucketId: appwriteConfig.bucketId,
    files: appwriteConfig.filesCollectionId,
    folders: appwriteConfig.foldersCollectionId,
    shares: appwriteConfig.sharesCollectionId,
    fileStates: appwriteConfig.fileStatesCollectionId,
    fileVersions: appwriteConfig.fileVersionsCollectionId,
    activity: appwriteConfig.activityCollectionId,
})

export const getPurger = async (budget?: number) => {
    const { databases, storage } = await createAdminClient()
    return createPurger({ databases, storage, ids: purgeIds(), budget })
}

// Who uploaded the current bytes: the newest "version" event, or the owner when there has never been a new version
export const currentUploader = async (databases: Databases, file: fileDocument) => {
    if ((file.versionCount ?? 1) > 1) {
        const latest = await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.activityCollectionId, [
            Query.equal("fileId", [file.$id]),
            Query.equal("action", ["version"]),
            Query.orderDesc("$createdAt"),
            Query.limit(1),
        ])
        const event = latest.documents[0] as unknown as ActivityDocument | undefined
        if (event) return event.actorId
    }
    return ownerIdOf(file)!
}

export const userNames = async (databases: Databases, ids: string[]) => {
    const names = new Map<string, string>()
    for (const batch of chunk([...new Set(ids)].filter(Boolean), PAGE_SIZE)) {
        const users = await listAll<UserDocument>(databases, appwriteConfig.userCollectionId, [
            Query.equal("$id", batch),
            Query.select(["$id", "fullName"]),
        ])
        users.forEach((u) => names.set(u.$id, u.fullName))
    }
    return names
}
