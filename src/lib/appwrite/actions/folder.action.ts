'use server'

import { redirect } from "next/navigation"
import { ID, Query } from "node-appwrite"
import { createAdminClient } from ".."
import { appwriteConfig } from "../config"
import { getCurrentUser } from "./user.action"
import { paresStringify } from "@/lib/utils"
import { Crumb, fileDocument, FolderDocument, ShareDocument } from "../../../../types"
import { ActionResult, chunk, getOwnedFile, getOwnedFolder, listAll, requireUser, revalidateBrowser } from "./shared"
import { toClientFile } from "./access"
import { attachStates, logActivities, logActivity } from "./lifecycle"

const validateName = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return { error: "Name can't be empty" }
    if (trimmed.length > 255) return { error: "Name must be 255 characters or fewer" }
    return { name: trimmed }
}

export const getFolderContents = async ({ folderId }: { folderId: string | null }) => {
    // The page renders alongside the layout, so it handles a missing session itself instead of throwing
    const user = await getCurrentUser()
    if (!user) redirect("/sign-in")
    const { databases } = await createAdminClient()

    let folder: FolderDocument | null = null
    let breadcrumbs: Crumb[] = []

    if (folderId) {
        folder = await getOwnedFolder(databases, folderId, user.$id)
        if (!folder) return null

        if (folder.ancestors.length > 0) {
            const ancestors = await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.foldersCollectionId, [
                Query.equal("$id", folder.ancestors),
                Query.limit(folder.ancestors.length),
            ])
            // Keep the stored root-to-parent order; the query returns documents unordered
            breadcrumbs = folder.ancestors
                .map((id) => ancestors.documents.find((d) => d.$id === id))
                .filter((d): d is NonNullable<typeof d> => Boolean(d))
                .map((d) => ({ id: d.$id, name: d.name as string }))
        }
    }

    const [folders, files] = await Promise.all([
        listAll<FolderDocument>(databases, appwriteConfig.foldersCollectionId, [
            Query.equal("ownerId", [user.$id]),
            folderId ? Query.equal("parentId", [folderId]) : Query.isNull("parentId"),
            Query.isNull("trashedAt"),
        ]),
        listAll<fileDocument>(databases, appwriteConfig.filesCollectionId, [
            Query.equal("ownerId", [user.$id]),
            folderId ? Query.equal("folderId", [folderId]) : Query.isNull("folderId"),
            Query.isNull("trashedAt"),
        ]).then((docs) => attachStates(databases, user.$id, docs)),
    ])

    // One query per 100 files tells which of them have at least one person on their share list
    const sharedIds = new Set<string>()
    for (const ids of chunk(files.map((f) => f.$id), 100)) {
        const shares = await listAll<ShareDocument>(databases, appwriteConfig.sharesCollectionId, [
            Query.equal("fileId", ids),
            Query.select(["fileId"]),
        ])
        shares.forEach((s) => sharedIds.add(s.fileId))
    }
    const clientFiles = files.map((f) => ({
        ...toClientFile(f, "owner"),
        isShared: sharedIds.has(f.$id) || f.linkAccess === "anyone",
    }))

    return paresStringify({ folder, breadcrumbs, folders, files: clientFiles }) as {
        folder: FolderDocument | null,
        breadcrumbs: Crumb[],
        folders: FolderDocument[],
        files: fileDocument[],
    }
}

// Flat list of every folder the user owns, used by the "Move to" picker
export const getFolderTree = async () => {
    const user = await requireUser()
    const { databases } = await createAdminClient()
    const folders = await listAll<FolderDocument>(databases, appwriteConfig.foldersCollectionId, [
        Query.equal("ownerId", [user.$id]),
        Query.isNull("trashedAt"),
        Query.select(["$id", "name", "parentId", "ancestors"]),
    ])
    return paresStringify(folders.map(({ $id, name, parentId, ancestors }) => ({ $id, name, parentId, ancestors }))) as
        Pick<FolderDocument, "$id" | "name" | "parentId" | "ancestors">[]
}

export const createFolder = async ({ name, parentId, path }: { name: string, parentId: string | null, path: string }): Promise<ActionResult<FolderDocument>> => {
    try {
        const user = await requireUser()
        const valid = validateName(name)
        if (valid.error) return { ok: false, error: valid.error }

        const { databases } = await createAdminClient()
        let ancestors: string[] = []
        if (parentId) {
            const parent = await getOwnedFolder(databases, parentId, user.$id)
            if (!parent) return { ok: false, error: "Parent folder not found" }
            ancestors = [...parent.ancestors, parent.$id]
        }

        const folder = await databases.createDocument(appwriteConfig.databaseId, appwriteConfig.foldersCollectionId, ID.unique(), {
            name: valid.name,
            parentId,
            ancestors,
            ownerId: user.$id,
            accountId: user.accountId,
            users: [],
        })
        revalidateBrowser(path)
        return { ok: true, data: paresStringify(folder) }
    } catch (error) {
        console.error("Failed to create folder", error)
        return { ok: false, error: "Couldn't create the folder" }
    }
}

export const renameFolder = async ({ folderId, name, path }: { folderId: string, name: string, path: string }): Promise<ActionResult> => {
    try {
        const user = await requireUser()
        const valid = validateName(name)
        if (valid.error) return { ok: false, error: valid.error }

        const { databases } = await createAdminClient()
        const folder = await getOwnedFolder(databases, folderId, user.$id)
        if (!folder) return { ok: false, error: "Folder not found" }

        await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.foldersCollectionId, folderId, { name: valid.name })
        if (folder.name !== valid.name) {
            await logActivity(databases, user, { action: "rename", folderId, detail: { from: folder.name, to: valid.name } })
        }
        revalidateBrowser(path)
        return { ok: true }
    } catch (error) {
        console.error("Failed to rename folder", error)
        return { ok: false, error: "Couldn't rename the folder" }
    }
}

export const moveItems = async ({ fileIds, folderIds, targetFolderId, path }: {
    fileIds: string[],
    folderIds: string[],
    targetFolderId: string | null,
    path: string,
}): Promise<ActionResult<{ moved: number }>> => {
    try {
        const user = await requireUser()
        const { databases } = await createAdminClient()

        // Each Appwrite call is a network round-trip, so independent lookups run together
        const [target, folders, files] = await Promise.all([
            targetFolderId ? getOwnedFolder(databases, targetFolderId, user.$id) : null,
            Promise.all(folderIds.map((id) => getOwnedFolder(databases, id, user.$id))),
            Promise.all(fileIds.map((id) => getOwnedFile(databases, id, user.$id))),
        ])
        if (targetFolderId && !target) return { ok: false, error: "Destination folder not found" }
        if (folders.some((f) => !f)) return { ok: false, error: "Some folders could not be found" }
        if (files.some((f) => !f)) return { ok: false, error: "Some files could not be found" }
        const targetAncestors = target ? [...target.ancestors, target.$id] : []

        // A folder can't be moved into itself or anywhere below it
        if (folders.some((f) => f!.$id === targetFolderId || targetAncestors.includes(f!.$id))) {
            return { ok: false, error: "A folder can't be moved into itself" }
        }

        const foldersToMove = (folders as FolderDocument[]).filter((f) => (f.parentId ?? null) !== targetFolderId)
        const filesToMove = (files as fileDocument[]).filter((f) => (f.folderId ?? null) !== targetFolderId)

        const moveFolder = async (folder: FolderDocument) => {
            // Rewrite the path prefix of everything below the moved folder
            const [descendants] = await Promise.all([
                listAll<FolderDocument>(databases, appwriteConfig.foldersCollectionId, [
                    Query.contains("ancestors", [folder.$id]),
                ]),
                databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.foldersCollectionId, folder.$id, {
                    parentId: targetFolderId,
                    ancestors: targetAncestors,
                }),
            ])
            for (const batch of chunk(descendants, 10)) {
                await Promise.all(batch.map((d) => databases.updateDocument(
                    appwriteConfig.databaseId,
                    appwriteConfig.foldersCollectionId,
                    d.$id,
                    { ancestors: [...targetAncestors, ...d.ancestors.slice(d.ancestors.indexOf(folder.$id))] },
                )))
            }
        }

        const moveFiles = async () => {
            for (const batch of chunk(filesToMove, 10)) {
                await Promise.all(batch.map((f) => databases.updateDocument(
                    appwriteConfig.databaseId,
                    appwriteConfig.filesCollectionId,
                    f.$id,
                    { folderId: targetFolderId },
                )))
            }
        }

        await Promise.all([...foldersToMove.map(moveFolder), moveFiles()])
        const moved = foldersToMove.length + filesToMove.length

        const to = target?.name ?? "My Files"
        await logActivities(databases, user, [
            ...foldersToMove.map((f) => ({ action: "move" as const, folderId: f.$id, detail: { to, toId: targetFolderId } })),
            ...filesToMove.map((f) => ({ action: "move" as const, fileId: f.$id, folderId: targetFolderId, detail: { to, toId: targetFolderId } })),
        ])

        revalidateBrowser(path)
        return { ok: true, data: { moved } }
    } catch (error) {
        console.error("Failed to move items", error)
        return { ok: false, error: "Couldn't move the items" }
    }
}
