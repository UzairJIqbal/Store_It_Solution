'use server'

// Lists what a ZIP download of folders and files should hold. The browser fetches each file through
// /api/files/{id} and builds the ZIP itself, so no file bytes pass through this action.

import { Query } from "node-appwrite"
import { createAdminClient } from ".."
import { appwriteConfig } from "../config"
import { fileDocument, FolderDocument } from "../../../../types"
import { ActionResult, chunk, getOwnedFolder, listAll, PAGE_SIZE, requireUser } from "./shared"

export interface DownloadEntry {
    id: string,
    // Path inside the ZIP: "Trip/photos/beach.jpg"
    path: string,
    size: number,
}

export const getDownloadTree = async ({ folderIds, fileIds }: { folderIds: string[], fileIds: string[] }): Promise<ActionResult<DownloadEntry[]>> => {
    try {
        const user = await requireUser()
        const { databases } = await createAdminClient()
        const entries: DownloadEntry[] = []

        for (const ids of chunk(fileIds, PAGE_SIZE)) {
            const files = await listAll<fileDocument>(databases, appwriteConfig.filesCollectionId, [
                Query.equal("$id", ids),
                Query.equal("ownerId", [user.$id]),
                Query.isNull("trashedAt"),
                Query.select(["$id", "name", "size"]),
            ])
            files.forEach((f) => entries.push({ id: f.$id, path: f.name, size: f.size }))
        }

        for (const folderId of folderIds) {
            const root = await getOwnedFolder(databases, folderId, user.$id)
            if (!root) continue
            const descendants = await listAll<FolderDocument>(databases, appwriteConfig.foldersCollectionId, [
                Query.contains("ancestors", [root.$id]),
                Query.equal("ownerId", [user.$id]),
                Query.isNull("trashedAt"),
                Query.select(["$id", "name", "parentId"]),
            ])
            const byId = new Map([root, ...descendants].map((f) => [f.$id, f]))
            const pathOf = (id: string): string => {
                const folder = byId.get(id)!
                return folder.$id === root.$id || !folder.parentId || !byId.has(folder.parentId)
                    ? folder.name
                    : `${pathOf(folder.parentId)}/${folder.name}`
            }
            for (const ids of chunk([...byId.keys()], PAGE_SIZE)) {
                const files = await listAll<fileDocument>(databases, appwriteConfig.filesCollectionId, [
                    Query.equal("folderId", ids),
                    Query.equal("ownerId", [user.$id]),
                    Query.isNull("trashedAt"),
                    Query.select(["$id", "name", "size", "folderId"]),
                ])
                files.forEach((f) => entries.push({ id: f.$id, path: `${pathOf(f.folderId!)}/${f.name}`, size: f.size }))
            }
        }
        return { ok: true, data: entries }
    } catch (error) {
        console.error("Failed to list download", error)
        return { ok: false, error: "Couldn't prepare the download" }
    }
}
