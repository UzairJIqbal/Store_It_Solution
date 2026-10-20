// Search, Home suggestions and the Storage report (docs/search-home-research/plan.md).
// Not a 'use server' module: these are reads, called from server components and /api route handlers,
// so they never queue behind a pending server action on the page.

import { Query } from "node-appwrite"
import { createAdminClient } from ".."
import { appwriteConfig } from "../config"
import { paresStringify } from "@/lib/utils"
import { modifiedRange, SearchFilters } from "@/lib/search"
import { ActivityDocument, fileDocument, FileRole, FileStateDocument, FileType, FolderDocument } from "../../../../types"
import { chunk, Databases, listAll, ownerIdOf, PAGE_SIZE, requireUser } from "./shared"
import { getSharedRoles, toClientFile } from "./access"
import { attachStates, listVersionRows } from "./lifecycle"
import { STORAGE_LIMIT } from "../../../../constants"
import { matchSnippet } from "@/lib/smart/sanitize"


export type ItemLocation = { label: string, href: string | null }
export type SearchHit =
    // match says why a file came up when its name doesn't contain the search: a line of its text, or one of its tags
    | { kind: "file", file: fileDocument, location: ItemLocation, match?: { kind: "content" | "tag", text: string } }
    | { kind: "folder", folder: FolderDocument, location: ItemLocation }
export type SearchResult = { hits: SearchHit[], hasMore: boolean }

const MY_FILES: ItemLocation = { label: "My files", href: "/files" }
const SHARED: ItemLocation = { label: "Shared with me", href: "/shared" }
const TRASH: ItemLocation = { label: "Trash", href: "/trash" }

const or = (queries: string[]) => (queries.length === 1 ? queries[0] : Query.or(queries))

const folderNames = async (databases: Databases, ids: (string | null | undefined)[]) => {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
    const names = new Map<string, string>()
    for (const batch of chunk(unique, PAGE_SIZE)) {
        const rows = await listAll<FolderDocument>(databases, appwriteConfig.foldersCollectionId, [
            Query.equal("$id", batch), Query.select(["$id", "name"]),
        ])
        rows.forEach((f) => names.set(f.$id, f.name))
    }
    return names
}

const parentLocation = (names: Map<string, string>, parentId: string | null | undefined): ItemLocation =>
    parentId && names.has(parentId) ? { label: names.get(parentId)!, href: `/folders/${parentId}` } : MY_FILES

const starredIds = async (databases: Databases, userId: string) =>
    (await listAll<FileStateDocument>(databases, appwriteConfig.fileStatesCollectionId, [
        Query.equal("userId", [userId]),
        Query.equal("isStarred", [true]),
        Query.select(["fileId"]),
    ])).map((s) => s.fileId)

// ---------------------------------------------------------------- Search

export const searchItems = async (filters: SearchFilters, { limit = 50 }: { limit?: number } = {}): Promise<SearchResult> => {
    const user = await requireUser()
    const { databases } = await createAdminClient()
    const { q, types, location, owner } = filters
    const [from, to] = modifiedRange(filters)

    const fileTypes = types.filter((t) => t !== "folder") as FileType[]
    const wantFiles = types.length === 0 || fileTypes.length > 0
    // Folders are never shared or starred, so they only turn up in my own places
    const wantFolders = (types.length === 0 || types.includes("folder"))
        && owner !== "others" && ["anywhere", "mine", "trash"].includes(location)

    const inTrash = location === "trash"
    // Trash only ever holds my own items; everything else can mean mine, shared or both
    const ownedScope = owner !== "others" && location !== "shared"
    const sharedScope = owner !== "me" && ["anywhere", "shared", "starred"].includes(location)

    const [sharedRoles, starred] = await Promise.all([
        sharedScope ? getSharedRoles(databases, user.email) : Promise.resolve(new Map<string, FileRole>()),
        location === "starred" ? starredIds(databases, user.$id) : Promise.resolve(null),
    ])

    const common = (queries: string[], textQuery = q ? Query.contains("name", q) : null) => {
        queries.push(inTrash ? Query.isNotNull("trashedAt") : Query.isNull("trashedAt"))
        if (textQuery) queries.push(textQuery)
        if (from) queries.push(Query.greaterThanEqual("$updatedAt", from))
        if (to) queries.push(Query.lessThan("$updatedAt", to))
        queries.push(Query.orderDesc("$updatedAt"), Query.limit(limit + 1))
        return queries
    }

    const loadFiles = async () => {
        if (!wantFiles) return []
        const scopes: string[] = []
        if (ownedScope) scopes.push(Query.equal("ownerId", [user.$id]))
        if (sharedScope && sharedRoles.size > 0) {
            scopes.push(...chunk([...sharedRoles.keys()], PAGE_SIZE).map((ids) => Query.equal("$id", ids)))
        }
        if (scopes.length === 0) return []
        const queries = [or(scopes)]
        if (starred) {
            if (starred.length === 0) return []
            // Starred lists are small; a long one is cut to the first 100 most recently listed
            queries.push(Query.equal("$id", starred.slice(0, PAGE_SIZE)))
        }
        if (fileTypes.length) queries.push(Query.equal("type", fileTypes))
        // Files also match on the text inside them and on their smart tags
        const textQuery = q
            ? Query.or([Query.contains("name", q), Query.contains("content", q), Query.contains("tags", [q.toLowerCase()])])
            : null
        const page = await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, common(queries, textQuery))
        return page.documents as unknown as fileDocument[]
    }

    const loadFolders = async () => {
        if (!wantFolders) return []
        const page = await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.foldersCollectionId,
            common([Query.equal("ownerId", [user.$id])]))
        return page.documents as unknown as FolderDocument[]
    }

    const [files, folders] = await Promise.all([loadFiles(), loadFolders()])
    const [withStates, names] = await Promise.all([
        attachStates(databases, user.$id, files),
        folderNames(databases, [...files.filter((f) => ownerIdOf(f) === user.$id).map((f) => f.folderId), ...folders.map((f) => f.parentId)]),
    ])

    const hits: SearchHit[] = [
        ...folders.map((folder): SearchHit => ({
            kind: "folder", folder, location: inTrash ? TRASH : parentLocation(names, folder.parentId),
        })),
        ...withStates.map((file): SearchHit => {
            const mine = ownerIdOf(file) === user.$id
            return {
                kind: "file",
                file: toClientFile(file, mine ? "owner" : sharedRoles.get(file.$id) ?? "viewer"),
                location: inTrash ? TRASH : mine ? parentLocation(names, file.folderId) : SHARED,
                match: whyMatched(file, q),
            }
        }),
    ].sort((a, b) => updatedAt(b).localeCompare(updatedAt(a)))

    return paresStringify({ hits: hits.slice(0, limit), hasMore: hits.length > limit || files.length > limit || folders.length > limit })
}

const whyMatched = (file: fileDocument, q: string): { kind: "content" | "tag", text: string } | undefined => {
    if (!q || file.name.toLowerCase().includes(q.toLowerCase())) return undefined
    const tag = file.tags?.find((t) => t === q.toLowerCase())
    if (tag) return { kind: "tag", text: tag }
    const snippet = matchSnippet(file.content, q)
    return snippet ? { kind: "content", text: snippet } : undefined
}

const updatedAt = (hit: SearchHit) => (hit.kind === "file" ? hit.file.$updatedAt : hit.folder.$updatedAt)

// ---------------------------------------------------------------- Home

export type SuggestedFolder = { folder: FolderDocument, location: ItemLocation, at: string }

// Folders I worked in most recently (from the activity log), topped up with recently changed folders
export const getSuggestedFolders = async (max = 6): Promise<SuggestedFolder[]> => {
    const user = await requireUser()
    const { databases } = await createAdminClient()
    const [activity, recentFolders] = await Promise.all([
        databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.activityCollectionId, [
            Query.equal("actorId", [user.$id]),
            Query.isNotNull("folderId"),
            Query.orderDesc("$createdAt"),
            Query.limit(PAGE_SIZE),
            Query.select(["folderId", "$createdAt"]),
        ]),
        databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.foldersCollectionId, [
            Query.equal("ownerId", [user.$id]),
            Query.isNull("trashedAt"),
            Query.orderDesc("$updatedAt"),
            Query.limit(max),
        ]),
    ])

    const lastActivity = new Map<string, string>()
    for (const a of activity.documents as unknown as ActivityDocument[]) {
        if (a.folderId && !lastActivity.has(a.folderId)) lastActivity.set(a.folderId, a.$createdAt)
    }
    const known = new Map((recentFolders.documents as unknown as FolderDocument[]).map((f) => [f.$id, f]))
    const missing = [...lastActivity.keys()].filter((id) => !known.has(id)).slice(0, max)
    for (const batch of chunk(missing, PAGE_SIZE)) {
        const rows = await listAll<FolderDocument>(databases, appwriteConfig.foldersCollectionId, [
            Query.equal("$id", batch), Query.equal("ownerId", [user.$id]), Query.isNull("trashedAt"),
        ])
        rows.forEach((f) => known.set(f.$id, f))
    }

    const ranked = [...known.values()]
        .map((folder) => ({ folder, at: [lastActivity.get(folder.$id), folder.$updatedAt].filter(Boolean).sort().pop()! }))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, max)
    const names = await folderNames(databases, ranked.map((r) => r.folder.parentId))
    return paresStringify(ranked.map((r) => ({ ...r, location: parentLocation(names, r.folder.parentId) })))
}

// ---------------------------------------------------------------- Storage

export type StorageSegment = { key: FileType | "versions" | "trash", label: string, size: number, count: number, description: string }
export type DuplicateGroup = { name: string, size: number, files: fileDocument[] }
export type VersionedFile = { file: fileDocument, versions: number, size: number }

export type StorageReport = {
    used: number,
    limit: number,
    segments: StorageSegment[],
    largest: fileDocument[],
    cleanup: {
        large: { threshold: number, count: number, size: number },
        trash: { count: number, size: number },
        versions: { count: number, size: number, files: VersionedFile[] },
        duplicates: { count: number, size: number, groups: DuplicateGroup[] },
    },
}

export const LARGE_FILE_BYTES = 10 * 1024 * 1024
const LARGEST_ROWS = 25

const SEGMENT_INFO: Record<FileType, { label: string, description: string }> = {
    document: { label: "Documents", description: "PDFs, office files, text and code" },
    image: { label: "Images", description: "Photos, screenshots and graphics" },
    video: { label: "Videos", description: "Video files of any format" },
    audio: { label: "Audio", description: "Music, recordings and podcasts" },
    other: { label: "Other", description: "Archives and everything else" },
}

// Everything that counts towards my quota: my files (trashed ones too) and every old version of them
export const getStorageReport = async (): Promise<StorageReport> => {
    const user = await requireUser()
    const { databases } = await createAdminClient()
    const files = await listAll<fileDocument>(databases, appwriteConfig.filesCollectionId, [Query.equal("ownerId", [user.$id])])
    const versions = await listVersionRows(databases, files.map((f) => f.$id))

    const active = files.filter((f) => !f.trashedAt)
    const trashed = files.filter((f) => f.trashedAt)
    const segments: StorageSegment[] = (Object.keys(SEGMENT_INFO) as FileType[]).map((type) => {
        const ofType = active.filter((f) => (f.type as FileType) === type)
        return { key: type, ...SEGMENT_INFO[type], size: ofType.reduce((s, f) => s + f.size, 0), count: ofType.length }
    })
    const versionSize = versions.reduce((s, v) => s + v.size, 0)
    const trashSize = trashed.reduce((s, f) => s + f.size, 0)
    segments.push(
        { key: "versions", label: "Old versions", size: versionSize, count: versions.length, description: "Earlier versions kept when a file was replaced" },
        { key: "trash", label: "Trash", size: trashSize, count: trashed.length, description: "Deleted items still count until the trash is emptied" },
    )

    const bySize = [...active].sort((a, b) => b.size - a.size)
    const large = bySize.filter((f) => f.size >= LARGE_FILE_BYTES)

    const versionTotals = new Map<string, { versions: number, size: number }>()
    for (const v of versions) {
        const t = versionTotals.get(v.fileId) ?? { versions: 0, size: 0 }
        versionTotals.set(v.fileId, { versions: t.versions + 1, size: t.size + v.size })
    }
    const byId = new Map(active.map((f) => [f.$id, f]))
    const versioned = [...versionTotals].flatMap(([id, t]) => (byId.has(id) ? [{ file: byId.get(id)!, ...t }] : []))
        .sort((a, b) => b.size - a.size)

    // Same name and same size is a strong hint of a re-upload; empty files are left out
    const groups = new Map<string, fileDocument[]>()
    for (const f of active) {
        if (f.size === 0) continue
        const key = `${f.name.toLowerCase()}\u0000${f.size}`
        groups.set(key, [...(groups.get(key) ?? []), f])
    }
    const duplicates = [...groups.values()].filter((g) => g.length > 1)
        .map((g) => ({ name: g[0].name, size: g[0].size, files: g.sort((a, b) => a.$createdAt.localeCompare(b.$createdAt)) }))
        .sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1))

    const shown = new Set([...bySize.slice(0, LARGEST_ROWS), ...versioned.map((v) => v.file), ...duplicates.flatMap((d) => d.files)])
    const states = new Map((await attachStates(databases, user.$id, [...shown])).map((f) => [f.$id, toClientFile(f, "owner")]))
    const client = (f: fileDocument) => states.get(f.$id) ?? toClientFile(f, "owner")

    return paresStringify({
        used: files.reduce((s, f) => s + f.size, 0) + versionSize,
        limit: STORAGE_LIMIT,
        segments,
        largest: bySize.slice(0, LARGEST_ROWS).map(client),
        cleanup: {
            large: { threshold: LARGE_FILE_BYTES, count: large.length, size: large.reduce((s, f) => s + f.size, 0) },
            trash: { count: trashed.length, size: trashSize },
            versions: { count: versions.length, size: versionSize, files: versioned.map((v) => ({ ...v, file: client(v.file) })) },
            duplicates: {
                count: duplicates.reduce((s, d) => s + d.files.length - 1, 0),
                size: duplicates.reduce((s, d) => s + d.size * (d.files.length - 1), 0),
                groups: duplicates.map((d) => ({ ...d, files: d.files.map(client) })),
            },
        },
    })
}
