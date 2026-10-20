'use server'

// Trash, star, recent, details/activity and versions (docs/lifecycle-research/plan.md)

import { Query } from "node-appwrite"
import { revalidatePath } from "next/cache"
import { createAdminClient } from ".."
import { appwriteConfig } from "../config"
import { paresStringify } from "@/lib/utils"
import {
    ActivityAction, ActivityDocument, fileDocument, FileRole, FileStateDocument, FileVersionDocument, FolderDocument,
} from "../../../../types"
import {
    ActionResult, chunk, Databases, getOwnedFile, getOwnedFolder, listAll, ownerIdOf, PAGE_SIZE, requireUser, revalidateBrowser,
} from "./shared"
import { AccessError, getSharedRoles, requireFileAccess, toClientFile } from "./access"
import {
    attachStates, currentUploader, getPurger, getStates, listVersionRows, logActivities, logActivity, TRASH_DAYS, upsertState,
    userNames,
} from "./lifecycle"

type User = Awaited<ReturnType<typeof requireUser>>

const BATCH = 10
// The Trash page also clears this user's expired items, a little at a time, in case the daily Function is behind
const TRASH_PAGE_PURGE_BUDGET = 50
const SHARING_ACTIONS: ActivityAction[] = ["share", "unshare", "role", "link", "transfer"]

const errorMessage = (error: unknown, fallback: string) => error instanceof AccessError ? error.message : fallback

const revalidateLifecycle = (path?: string) => {
    revalidateBrowser(path)
    for (const p of ["/", "/recent", "/starred", "/trash", "/shared"]) revalidatePath(p)
    revalidatePath("/[types]", "page")
}

const runInBatches = async <T,>(items: T[], run: (item: T) => Promise<unknown>) => {
    for (const batch of chunk(items, BATCH)) await Promise.all(batch.map(run))
}

const listByIds = async <T,>(databases: Databases, collectionId: string, ids: string[], queries: string[] = []) => {
    const docs: T[] = []
    for (const batch of chunk([...new Set(ids)], PAGE_SIZE)) {
        docs.push(...await listAll<T>(databases, collectionId, [Query.equal("$id", batch), ...queries]))
    }
    return docs
}

// Files the caller can still open, with their role: owned, or shared with them, and not in the trash
const loadAccessibleFiles = async (databases: Databases, user: User, ids: string[]) => {
    if (ids.length === 0) return new Map<string, fileDocument>()
    const [sharedRoles, files] = await Promise.all([
        getSharedRoles(databases, user.email),
        listByIds<fileDocument>(databases, appwriteConfig.filesCollectionId, ids, [Query.isNull("trashedAt")]),
    ])
    const withStates = await attachStates(databases, user.$id, files)
    const accessible = new Map<string, fileDocument>()
    for (const file of withStates) {
        const role: FileRole | undefined = ownerIdOf(file) === user.$id ? "owner" : sharedRoles.get(file.$id)
        if (role) accessible.set(file.$id, toClientFile(file, role))
    }
    return accessible
}

// ---------------------------------------------------------------- Trash

const CLEAR_TRASH = { trashedAt: null, trashedBy: null, trashedRoot: null }

// Only the owner can move an item to trash; people it's shared with can remove their own access instead.
// A folder takes everything inside it along, and all of it shares the folder's trashedRoot so it comes back together.
export const trashItems = async ({ fileIds = [], folderIds = [], path }: {
    fileIds?: string[],
    folderIds?: string[],
    path?: string,
}): Promise<ActionResult<{ trashed: number }>> => {
    try {
        const user = await requireUser()
        const { databases } = await createAdminClient()
        const [folders, files] = await Promise.all([
            Promise.all(folderIds.map((id) => getOwnedFolder(databases, id, user.$id))),
            Promise.all(fileIds.map((id) => getOwnedFile(databases, id, user.$id))),
        ])
        if (folders.some((f) => !f) || files.some((f) => !f)) {
            return { ok: false, error: "Only the owner can move an item to trash" }
        }

        const trashedAt = new Date().toISOString()
        const stamp = (root: string) => ({ trashedAt, trashedBy: user.$id, trashedRoot: root })
        const fileRoots = new Map<string, string>((files as fileDocument[]).map((f) => [f.$id, f.$id]))
        const folderRoots = new Map<string, string>()

        for (const folder of folders as FolderDocument[]) {
            // Items inside that are already in the trash keep their own trash entry
            const descendants = await listAll<FolderDocument>(databases, appwriteConfig.foldersCollectionId, [
                Query.contains("ancestors", [folder.$id]),
                Query.isNull("trashedAt"),
            ])
            const groupIds = [folder.$id, ...descendants.map((d) => d.$id)]
            groupIds.forEach((id) => folderRoots.set(id, folder.$id))
            for (const ids of chunk(groupIds, PAGE_SIZE)) {
                const nested = await listAll<fileDocument>(databases, appwriteConfig.filesCollectionId, [
                    Query.equal("folderId", ids),
                    Query.isNull("trashedAt"),
                    Query.select(["$id"]),
                ])
                nested.forEach((f) => fileRoots.set(f.$id, folder.$id))
            }
        }

        // Contents first and the item itself last, so a failure part way never shows a half-trashed folder as restored
        const ordered = (entries: [string, string][]) =>
            [...entries.filter(([id, root]) => id !== root), ...entries.filter(([id, root]) => id === root)]
        await runInBatches(ordered([...fileRoots]), ([id, root]) =>
            databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, id, stamp(root)))
        await runInBatches(ordered([...folderRoots]), ([id, root]) =>
            databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.foldersCollectionId, id, stamp(root)))

        await logActivities(databases, user, [
            ...(folders as FolderDocument[]).map((f) => ({ action: "trash" as const, folderId: f.$id })),
            ...(files as fileDocument[]).map((f) => ({ action: "trash" as const, fileId: f.$id, folderId: f.folderId })),
        ])
        revalidateLifecycle(path)
        return { ok: true, data: { trashed: folders.length + files.length } }
    } catch (error) {
        console.error("Failed to move items to trash", error)
        return { ok: false, error: "Couldn't move the items to trash" }
    }
}

// The trash entries (roots) the caller owns among these ids
const loadTrashRoots = async (databases: Databases, user: User, fileIds: string[], folderIds: string[]) => {
    const [folders, files] = await Promise.all([
        Promise.all(folderIds.map((id) => getOwnedFolder(databases, id, user.$id, { includeTrashed: true }))),
        Promise.all(fileIds.map((id) => getOwnedFile(databases, id, user.$id, { includeTrashed: true }))),
    ])
    const isRoot = (doc: { $id: string, trashedAt?: string | null, trashedRoot?: string | null } | null) =>
        Boolean(doc?.trashedAt) && (doc!.trashedRoot ?? doc!.$id) === doc!.$id
    if (!folders.every(isRoot) || !files.every(isRoot)) return null
    return { folders: folders as FolderDocument[], files: files as fileDocument[] }
}

// Everything that went to trash with this folder
const loadTrashGroup = async (databases: Databases, user: User, rootId: string) => {
    const [folders, files] = await Promise.all([
        listAll<FolderDocument>(databases, appwriteConfig.foldersCollectionId, [
            Query.equal("ownerId", [user.$id]),
            Query.equal("trashedRoot", [rootId]),
        ]),
        listAll<fileDocument>(databases, appwriteConfig.filesCollectionId, [
            Query.equal("ownerId", [user.$id]),
            Query.equal("trashedRoot", [rootId]),
        ]),
    ])
    return { folders, files }
}

// Restore puts items back where they were. If that folder is gone or in the trash, they go to My Files instead.
export const restoreItems = async ({ fileIds = [], folderIds = [], path }: {
    fileIds?: string[],
    folderIds?: string[],
    path?: string,
}): Promise<ActionResult<{ restored: number, movedToRoot: number }>> => {
    try {
        const user = await requireUser()
        const { databases } = await createAdminClient()
        const roots = await loadTrashRoots(databases, user, fileIds, folderIds)
        if (!roots) return { ok: false, error: "Some items are no longer in the trash" }

        const parentAvailable = async (parentId: string | null | undefined) =>
            !parentId || Boolean(await getOwnedFolder(databases, parentId, user.$id))
        let movedToRoot = 0

        for (const folder of roots.folders) {
            const group = await loadTrashGroup(databases, user, folder.$id)
            if (!await parentAvailable(folder.parentId)) {
                movedToRoot++
                const descendants = await listAll<FolderDocument>(databases, appwriteConfig.foldersCollectionId, [
                    Query.contains("ancestors", [folder.$id]),
                ])
                await runInBatches(descendants, (d) => databases.updateDocument(appwriteConfig.databaseId,
                    appwriteConfig.foldersCollectionId, d.$id, { ancestors: d.ancestors.slice(d.ancestors.indexOf(folder.$id)) }))
                await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.foldersCollectionId, folder.$id, {
                    parentId: null, ancestors: [],
                })
            }
            // The folder itself first, so its contents never reappear inside a folder that is still in the trash
            await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.foldersCollectionId, folder.$id, CLEAR_TRASH)
            await runInBatches(group.folders.filter((f) => f.$id !== folder.$id), (f) =>
                databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.foldersCollectionId, f.$id, CLEAR_TRASH))
            await runInBatches(group.files, (f) =>
                databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, f.$id, CLEAR_TRASH))
        }

        for (const file of roots.files) {
            const toRoot = !await parentAvailable(file.folderId)
            if (toRoot) movedToRoot++
            await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, file.$id, {
                ...CLEAR_TRASH,
                ...(toRoot ? { folderId: null } : {}),
            })
        }

        await logActivities(databases, user, [
            ...roots.folders.map((f) => ({ action: "restore" as const, folderId: f.$id })),
            ...roots.files.map((f) => ({ action: "restore" as const, fileId: f.$id, folderId: f.folderId })),
        ])
        revalidateLifecycle(path)
        return { ok: true, data: { restored: roots.folders.length + roots.files.length, movedToRoot } }
    } catch (error) {
        console.error("Failed to restore items", error)
        return { ok: false, error: "Couldn't restore the items" }
    }
}

// Permanent. Only for items already in the trash; the confirmation lives in the UI.
export const deleteForever = async ({ fileIds = [], folderIds = [], path }: {
    fileIds?: string[],
    folderIds?: string[],
    path?: string,
}): Promise<ActionResult<{ deleted: number }>> => {
    try {
        const user = await requireUser()
        const { databases } = await createAdminClient()
        const roots = await loadTrashRoots(databases, user, fileIds, folderIds)
        if (!roots) return { ok: false, error: "Only items in the trash can be deleted forever" }

        const purger = await getPurger()
        for (const folder of roots.folders) {
            const group = await loadTrashGroup(databases, user, folder.$id)
            await purger.purgeFiles(group.files)
            await purger.purgeFolders(group.folders)
        }
        await purger.purgeFiles(roots.files)

        revalidateLifecycle(path)
        return { ok: true, data: { deleted: roots.folders.length + roots.files.length } }
    } catch (error) {
        console.error("Failed to delete forever", error)
        return { ok: false, error: "Couldn't delete the items" }
    }
}

export const emptyTrash = async ({ path }: { path?: string } = {}): Promise<ActionResult<{ deleted: number }>> => {
    try {
        const user = await requireUser()
        const { databases } = await createAdminClient()
        const [files, folders] = await Promise.all([
            listAll<fileDocument>(databases, appwriteConfig.filesCollectionId, [
                Query.equal("ownerId", [user.$id]),
                Query.isNotNull("trashedAt"),
            ]),
            listAll<FolderDocument>(databases, appwriteConfig.foldersCollectionId, [
                Query.equal("ownerId", [user.$id]),
                Query.isNotNull("trashedAt"),
            ]),
        ])
        const purger = await getPurger()
        await purger.purgeFiles(files)
        await purger.purgeFolders(folders)
        revalidateLifecycle(path)
        return { ok: true, data: { deleted: files.length + folders.length } }
    } catch (error) {
        console.error("Failed to empty trash", error)
        return { ok: false, error: "Couldn't empty the trash" }
    }
}

export type TrashItem = {
    kind: "file" | "folder",
    id: string,
    name: string,
    trashedAt: string,
    // When the daily cleanup deletes it
    deleteAfter: string,
    // Where Restore puts it back
    location: string,
    // Files only
    file?: fileDocument,
    // Folders only: how many items went to the trash with it
    itemCount?: number,
}

export const getTrash = async (): Promise<{ items: TrashItem[], days: number }> => {
    const user = await requireUser()
    const { databases } = await createAdminClient()

    try {
        const purger = await getPurger(TRASH_PAGE_PURGE_BUDGET)
        await purger.purgeExpired({ owner: { userId: user.$id, accountId: user.accountId } })
    } catch (error) {
        console.error("Trash backstop cleanup failed", error)
    }

    const [files, folders] = await Promise.all([
        listAll<fileDocument>(databases, appwriteConfig.filesCollectionId, [
            Query.equal("ownerId", [user.$id]),
            Query.isNotNull("trashedAt"),
        ]),
        listAll<FolderDocument>(databases, appwriteConfig.foldersCollectionId, [
            Query.equal("ownerId", [user.$id]),
            Query.isNotNull("trashedAt"),
        ]),
    ])
    const isRoot = (doc: { $id: string, trashedRoot?: string | null }) => (doc.trashedRoot ?? doc.$id) === doc.$id
    const groupSize = new Map<string, number>()
    for (const doc of [...files, ...folders]) {
        if (!isRoot(doc)) groupSize.set(doc.trashedRoot!, (groupSize.get(doc.trashedRoot!) ?? 0) + 1)
    }

    const rootFiles = files.filter(isRoot)
    const rootFolders = folders.filter(isRoot)
    const parentIds = [...rootFiles.map((f) => f.folderId), ...rootFolders.map((f) => f.parentId)].filter((id): id is string => Boolean(id))
    const parents = new Map((await listByIds<FolderDocument>(databases, appwriteConfig.foldersCollectionId, parentIds))
        .filter((p) => p.ownerId === user.$id && !p.trashedAt)
        .map((p) => [p.$id, p.name]))
    const locationOf = (parentId?: string | null) => (parentId && parents.get(parentId)) || "My Files"
    const deleteAfter = (at: string) => new Date(new Date(at).getTime() + TRASH_DAYS * 86_400_000).toISOString()

    const items: TrashItem[] = [
        ...rootFolders.map((f) => ({
            kind: "folder" as const, id: f.$id, name: f.name, trashedAt: f.trashedAt!, deleteAfter: deleteAfter(f.trashedAt!),
            location: locationOf(f.parentId), itemCount: groupSize.get(f.$id) ?? 0,
        })),
        ...rootFiles.map((f) => ({
            kind: "file" as const, id: f.$id, name: f.name, trashedAt: f.trashedAt!, deleteAfter: deleteAfter(f.trashedAt!),
            location: locationOf(f.folderId), file: toClientFile(f, "owner"),
        })),
    ].sort((a, b) => b.trashedAt.localeCompare(a.trashedAt))

    return paresStringify({ items, days: TRASH_DAYS })
}

// ---------------------------------------------------------------- Star and opens

// A star is private to each person, so anyone who can open a file can star it
export const toggleStar = async ({ fileId, starred, path }: { fileId: string, starred: boolean, path?: string }): Promise<ActionResult> => {
    try {
        const { user, databases } = await requireFileAccess(fileId, "viewer")
        await upsertState(databases, user.$id, fileId, {
            isStarred: starred,
            starredAt: starred ? new Date().toISOString() : null,
        })
        if (path) revalidatePath(path)
        revalidatePath("/starred")
        return { ok: true }
    } catch (error) {
        console.error("Failed to change star", error)
        return { ok: false, error: errorMessage(error, starred ? "Couldn't add the star" : "Couldn't remove the star") }
    }
}

// Opening a file in the preview counts as "opened" for Recent and Details
export const markOpened = async ({ fileId }: { fileId: string }): Promise<ActionResult<{ at: string }>> => {
    try {
        const { user, databases } = await requireFileAccess(fileId, "viewer")
        const at = new Date().toISOString()
        await upsertState(databases, user.$id, fileId, { lastOpenedAt: at })
        return { ok: true, data: { at } }
    } catch (error) {
        return { ok: false, error: errorMessage(error, "Couldn't record the open") }
    }
}

export type StarredSort = "starred" | "name" | "modified"

export const getStarred = async ({ sort = "starred" }: { sort?: StarredSort } = {}): Promise<{ file: fileDocument, starredAt: string }[]> => {
    const user = await requireUser()
    const { databases } = await createAdminClient()
    const states = await listAll<FileStateDocument>(databases, appwriteConfig.fileStatesCollectionId, [
        Query.equal("userId", [user.$id]),
        Query.equal("isStarred", [true]),
    ])
    const files = await loadAccessibleFiles(databases, user, states.map((s) => s.fileId))
    const items = states.flatMap((s) => {
        const file = files.get(s.fileId)
        return file ? [{ file, starredAt: s.starredAt ?? s.$updatedAt }] : []
    })
    const compare = {
        starred: (a: typeof items[0], b: typeof items[0]) => b.starredAt.localeCompare(a.starredAt),
        name: (a: typeof items[0], b: typeof items[0]) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: "base" }),
        modified: (a: typeof items[0], b: typeof items[0]) => b.file.$updatedAt.localeCompare(a.file.$updatedAt),
    }[sort] ?? (() => 0)
    return paresStringify(items.sort(compare))
}

export type RecentReason = "opened" | "uploaded" | "modified" | "shared"
export type RecentItem = { file: fileDocument, at: string, reason: RecentReason }

const RECENT_LIMIT = 100

// Files I opened, uploaded or changed, mine or shared with me, newest first
export const getRecent = async (): Promise<RecentItem[]> => {
    const user = await requireUser()
    const { databases } = await createAdminClient()
    const [opened, acted, uploaded] = await Promise.all([
        databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.fileStatesCollectionId, [
            Query.equal("userId", [user.$id]),
            Query.isNotNull("lastOpenedAt"),
            Query.orderDesc("lastOpenedAt"),
            Query.limit(RECENT_LIMIT),
        ]),
        databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.activityCollectionId, [
            Query.equal("actorId", [user.$id]),
            Query.isNotNull("fileId"),
            Query.orderDesc("$createdAt"),
            Query.limit(RECENT_LIMIT),
        ]),
        // Files uploaded before the activity log existed
        databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, [
            Query.equal("ownerId", [user.$id]),
            Query.isNull("trashedAt"),
            Query.orderDesc("$createdAt"),
            Query.limit(RECENT_LIMIT),
            Query.select(["$id", "$createdAt"]),
        ]),
    ])

    const best = new Map<string, { at: string, reason: RecentReason }>()
    const consider = (fileId: string, at: string, reason: RecentReason) => {
        const current = best.get(fileId)
        if (!current || at > current.at) best.set(fileId, { at, reason })
    }
    for (const s of opened.documents as unknown as FileStateDocument[]) consider(s.fileId, s.lastOpenedAt!, "opened")
    for (const a of acted.documents as unknown as ActivityDocument[]) {
        if (a.action === "trash") continue
        const reason: RecentReason = a.action === "upload" ? "uploaded" : SHARING_ACTIONS.includes(a.action) ? "shared" : "modified"
        consider(a.fileId!, a.$createdAt, reason)
    }
    for (const f of uploaded.documents) consider(f.$id, f.$createdAt, "uploaded")

    const files = await loadAccessibleFiles(databases, user, [...best.keys()])
    const items = [...best].flatMap(([fileId, entry]) => {
        const file = files.get(fileId)
        return file ? [{ file, ...entry }] : []
    })
    return paresStringify(items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, RECENT_LIMIT))
}

// ---------------------------------------------------------------- Details and activity

export type ActivityEntry = {
    id: string,
    action: ActivityAction,
    actorName: string,
    isMe: boolean,
    at: string,
    detail: Record<string, unknown>,
    // For events in a folder's feed that happened to a file inside it
    fileId?: string | null,
    fileName?: string | null,
}

const parseDetail = (detail?: string | null) => {
    try {
        return detail ? JSON.parse(detail) as Record<string, unknown> : {}
    } catch {
        return {}
    }
}

const toEntries = (rows: ActivityDocument[], user: User, fileNames = new Map<string, string>()): ActivityEntry[] =>
    rows.map((a) => ({
        id: a.$id,
        action: a.action,
        actorName: a.actorName,
        isMe: a.actorId === user.$id,
        at: a.$createdAt,
        detail: parseDetail(a.detail),
        fileId: a.fileId ?? null,
        fileName: a.fileId ? fileNames.get(a.fileId) ?? null : null,
    }))

const ACTIVITY_LIMIT = 100

// The activity of one file (anyone with access; sharing events only for editors and the owner, since they name
// other people) or of one folder and the files in it (owner only)
export const getActivity = async ({ fileId, folderId }: { fileId?: string, folderId?: string }): Promise<ActionResult<ActivityEntry[]>> => {
    try {
        if (fileId) {
            const { role, user, databases } = await requireFileAccess(fileId, "viewer", { allowTrashed: true })
            const rows = await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.activityCollectionId, [
                Query.equal("fileId", [fileId]),
                Query.orderDesc("$createdAt"),
                Query.limit(ACTIVITY_LIMIT),
            ])
            const visible = (rows.documents as unknown as ActivityDocument[])
                .filter((a) => role !== "viewer" || !SHARING_ACTIONS.includes(a.action))
            return { ok: true, data: paresStringify(toEntries(visible, user)) }
        }
        if (folderId) {
            const user = await requireUser()
            const { databases } = await createAdminClient()
            if (!await getOwnedFolder(databases, folderId, user.$id, { includeTrashed: true })) throw new AccessError("Folder not found")
            const rows = (await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.activityCollectionId, [
                Query.equal("folderId", [folderId]),
                Query.orderDesc("$createdAt"),
                Query.limit(ACTIVITY_LIMIT),
            ])).documents as unknown as ActivityDocument[]
            const fileIds = rows.map((a) => a.fileId).filter((id): id is string => Boolean(id))
            const names = new Map((await listByIds<fileDocument>(databases, appwriteConfig.filesCollectionId, fileIds, [
                Query.select(["$id", "name"]),
            ])).map((f) => [f.$id, f.name]))
            return { ok: true, data: paresStringify(toEntries(rows, user, names)) }
        }
        return { ok: false, error: "Nothing selected" }
    } catch (error) {
        console.error("Failed to load activity", error)
        return { ok: false, error: errorMessage(error, "Couldn't load activity") }
    }
}

export type FileDetailsData = {
    file: fileDocument,
    location: string,
    locationId: string | null,
    openedAt: string | null,
    storageUsed: number,
    versions: number,
    sharedWith: number,
    linkOn: boolean,
}

export const getFileDetails = async ({ fileId }: { fileId: string }): Promise<ActionResult<FileDetailsData>> => {
    try {
        const { file, role, user, databases } = await requireFileAccess(fileId, "viewer", { allowTrashed: true })
        const [states, versions, shares, folder] = await Promise.all([
            getStates(databases, user.$id, [fileId]),
            listVersionRows(databases, [fileId]),
            databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.sharesCollectionId, [
                Query.equal("fileId", [fileId]),
                Query.limit(1),
            ]),
            role === "owner" && file.folderId ? getOwnedFolder(databases, file.folderId, user.$id, { includeTrashed: true }) : null,
        ])
        const state = states.get(fileId)
        const location = role !== "owner" ? "Shared with me" : folder?.name ?? "My Files"
        return {
            ok: true,
            data: paresStringify({
                file: toClientFile({ ...file, isStarred: state?.isStarred ?? false, lastOpenedAt: state?.lastOpenedAt ?? null }, role),
                location,
                locationId: role === "owner" ? folder?.$id ?? null : null,
                openedAt: state?.lastOpenedAt ?? null,
                storageUsed: file.size + versions.reduce((sum, v) => sum + v.size, 0),
                versions: versions.length + 1,
                sharedWith: shares.total,
                linkOn: file.linkAccess === "anyone" && Boolean(file.linkToken),
            }),
        }
    } catch (error) {
        console.error("Failed to load details", error)
        return { ok: false, error: errorMessage(error, "Couldn't load details") }
    }
}

// ---------------------------------------------------------------- Versions

export type VersionEntry = {
    // null for the current version, which lives on the file itself
    id: string | null,
    number: number,
    name: string,
    size: number,
    uploadedAt: string,
    uploadedBy: string,
    isCurrent: boolean,
}

export const listVersions = async ({ fileId }: { fileId: string }): Promise<ActionResult<{ canEdit: boolean, versions: VersionEntry[] }>> => {
    try {
        const { file, role, databases } = await requireFileAccess(fileId, "viewer")
        const [rows, uploaderId] = await Promise.all([
            listAll<FileVersionDocument>(databases, appwriteConfig.fileVersionsCollectionId, [
                Query.equal("fileId", [fileId]),
                Query.orderDesc("number"),
            ]),
            currentUploader(databases, file),
        ])
        const names = await userNames(databases, [uploaderId, ...rows.map((v) => v.uploadedBy)])
        const versions: VersionEntry[] = [
            {
                id: null, number: file.versionCount ?? 1, name: file.name, size: file.size,
                uploadedAt: file.currentVersionAt ?? file.$createdAt, uploadedBy: names.get(uploaderId) ?? "Unknown", isCurrent: true,
            },
            ...rows.map((v) => ({
                id: v.$id, number: v.number, name: v.name, size: v.size,
                uploadedAt: v.uploadedAt, uploadedBy: names.get(v.uploadedBy) ?? "Unknown", isCurrent: false,
            })),
        ]
        return { ok: true, data: paresStringify({ canEdit: role !== "viewer", versions }) }
    } catch (error) {
        console.error("Failed to list versions", error)
        return { ok: false, error: errorMessage(error, "Couldn't load versions") }
    }
}

// Old versions only; the current one goes when the file is deleted
export const deleteVersion = async ({ fileId, versionId, path }: { fileId: string, versionId: string, path?: string }): Promise<ActionResult> => {
    try {
        const { file, user, databases } = await requireFileAccess(fileId, "editor")
        const version = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.fileVersionsCollectionId, versionId)
            .then((doc) => doc as unknown as FileVersionDocument, () => null)
        if (!version || version.fileId !== fileId) return { ok: false, error: "That version no longer exists" }
        await (await getPurger()).purgeVersion(version)
        await logActivity(databases, user, { action: "version_delete", fileId, folderId: file.folderId, detail: { number: version.number } })
        if (path) revalidatePath(path)
        return { ok: true }
    } catch (error) {
        console.error("Failed to delete version", error)
        return { ok: false, error: errorMessage(error, "Couldn't delete the version") }
    }
}
