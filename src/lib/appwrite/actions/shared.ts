// Helpers shared by the server action modules. Not a 'use server' file, so nothing here is callable from the client.
import { Query } from "node-appwrite"
import { revalidatePath } from "next/cache"
import { createAdminClient } from ".."
import { appwriteConfig } from "../config"
import { getCurrentUser } from "./user.action"
import { fileDocument, FolderDocument } from "../../../../types"

export type Databases = Awaited<ReturnType<typeof createAdminClient>>["databases"]
export type ActionResult<T = undefined> = { ok: true, data?: T } | { ok: false, error: string }

export const PAGE_SIZE = 100

// files.ownerId is a relationship (expanded to the user document), folders.ownerId is a plain id
export const ownerIdOf = (doc: { ownerId: unknown }) =>
    typeof doc.ownerId === "string" ? doc.ownerId : (doc.ownerId as { $id?: string } | null)?.$id

export const listAll = async <T,>(databases: Databases, collectionId: string, queries: string[]) => {
    const documents: T[] = []
    let cursor: string | undefined
    while (true) {
        const page = await databases.listDocuments(appwriteConfig.databaseId, collectionId, [
            ...queries,
            Query.limit(PAGE_SIZE),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ])
        documents.push(...(page.documents as unknown as T[]))
        if (page.documents.length < PAGE_SIZE) return documents
        cursor = page.documents[page.documents.length - 1].$id
    }
}

export const chunk = <T,>(items: T[], size: number) =>
    Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))

export const requireUser = async () => {
    const user = await getCurrentUser()
    if (!user) throw new Error("User is not authenticated")
    return user
}

// Items in the trash count as missing unless the caller is working with the trash
type OwnedOptions = { includeTrashed?: boolean }

export const getOwnedFolder = async (databases: Databases, folderId: string, userId: string, { includeTrashed }: OwnedOptions = {}) => {
    try {
        const folder = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.foldersCollectionId, folderId) as unknown as FolderDocument
        return folder.ownerId === userId && (includeTrashed || !folder.trashedAt) ? folder : null
    } catch {
        return null
    }
}

export const getOwnedFile = async (databases: Databases, fileId: string, userId: string, { includeTrashed }: OwnedOptions = {}) => {
    try {
        const file = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, fileId) as unknown as fileDocument
        return ownerIdOf(file) === userId && (includeTrashed || !file.trashedAt) ? file : null
    } catch {
        return null
    }
}

// Every folder page, plus the root listing, can show a changed item
export const revalidateBrowser = (path?: string) => {
    if (path) revalidatePath(path)
    revalidatePath("/files")
    revalidatePath("/folders/[id]", "page")
}
