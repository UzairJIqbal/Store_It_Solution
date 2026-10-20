// Read helpers for drop links. Not a 'use server' file: pages call these on the server, the client can't.
import { Query } from "node-appwrite"
import { createAdminClient } from ".."
import { appwriteConfig } from "../config"
import { DropDocument } from "../../../../types"
import { Databases, listAll, requireUser } from "./shared"

const CODE_PATTERN = /^[A-Za-z0-9_-]{24}$/

export const findDropByCode = async (databases: Databases, code: string) => {
    if (typeof code !== "string" || !CODE_PATTERN.test(code)) return null
    const page = await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.dropsCollectionId, [
        Query.equal("code", [code]),
        Query.limit(1),
    ])
    return (page.documents[0] as unknown as DropDocument | undefined) ?? null
}

export const dropIsOpen = (drop: DropDocument) =>
    drop.enabled
    && (!drop.expiresAt || new Date(drop.expiresAt).getTime() > Date.now())
    && drop.filesReceived < drop.maxFiles

export type DropStatus = "open" | "paused" | "expired" | "full"

export const dropStatus = (drop: DropDocument): DropStatus =>
    !drop.enabled ? "paused"
        : drop.expiresAt && new Date(drop.expiresAt).getTime() <= Date.now() ? "expired"
            : drop.filesReceived >= drop.maxFiles ? "full"
                : "open"

// What a visitor to the public page may see: no ids of the owner, the folder or the upload user
export interface PublicDrop {
    code: string,
    title: string,
    message: string | null,
    ownerName: string,
    status: DropStatus,
    filesLeft: number,
    expiresAt: string | null,
}

export const getPublicDrop = async (code: string): Promise<PublicDrop | null> => {
    const { databases } = await createAdminClient()
    const drop = await findDropByCode(databases, code)
    if (!drop) return null
    const owner = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, drop.ownerId)
        .catch(() => null) as { fullName?: string } | null
    return {
        code: drop.code,
        title: drop.title,
        message: drop.message ?? null,
        // First name only
        ownerName: owner?.fullName?.trim().split(/\s+/)[0] || "Someone",
        status: dropStatus(drop),
        filesLeft: Math.max(0, drop.maxFiles - drop.filesReceived),
        expiresAt: drop.expiresAt ?? null,
    }
}

export interface MyDrop {
    $id: string,
    $createdAt: string,
    code: string,
    title: string,
    message: string | null,
    folderId: string | null,
    folderName: string | null,
    status: DropStatus,
    enabled: boolean,
    expiresAt: string | null,
    maxFiles: number,
    filesReceived: number,
    lastReceivedAt: string | null,
}

export const listMyDrops = async (): Promise<MyDrop[]> => {
    const user = await requireUser()
    const { databases } = await createAdminClient()
    const drops = await listAll<DropDocument>(databases, appwriteConfig.dropsCollectionId, [
        Query.equal("ownerId", [user.$id]),
        Query.orderDesc("$createdAt"),
    ])
    const folderIds = [...new Set(drops.map((d) => d.folderId).filter((id): id is string => !!id))]
    const folders = folderIds.length
        ? await listAll<{ $id: string, name: string, trashedAt?: string | null }>(databases, appwriteConfig.foldersCollectionId, [
            Query.equal("$id", folderIds),
            Query.select(["$id", "name", "trashedAt"]),
        ])
        : []
    const live = new Map(folders.filter((f) => !f.trashedAt).map((f) => [f.$id, f.name]))
    return drops.map((d) => ({
        $id: d.$id,
        $createdAt: d.$createdAt,
        code: d.code,
        title: d.title,
        message: d.message ?? null,
        folderId: d.folderId && live.has(d.folderId) ? d.folderId : null,
        folderName: d.folderId ? live.get(d.folderId) ?? null : null,
        status: dropStatus(d),
        enabled: d.enabled,
        expiresAt: d.expiresAt ?? null,
        maxFiles: d.maxFiles,
        filesReceived: d.filesReceived,
        lastReceivedAt: d.lastReceivedAt ?? null,
    }))
}
