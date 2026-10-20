// One-off Appwrite setup for folders. Run with: bun scripts/setup-folders.ts
// Bun loads .env / .env.local automatically. Safe to re-run: existing attributes and indexes are skipped.
import { AppwriteException, Client, Databases, IndexType } from "node-appwrite"

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE
const filesCollectionId = process.env.NEXT_PUBLIC_APPWRITE_FILES_COLLECTION
const key = process.env.APPWRITE_KEY
const foldersCollectionId = process.env.NEXT_PUBLIC_APPWRITE_FOLDERS_COLLECTION || "folders"

if (!endpoint || !projectId || !databaseId || !filesCollectionId || !key) {
    console.error("Missing Appwrite env vars (endpoint, project, database, files collection, APPWRITE_KEY)")
    process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(key)
const databases = new Databases(client)

const alreadyExists = (error: unknown) => error instanceof AppwriteException && error.code === 409

const step = async (label: string, run: () => Promise<unknown>) => {
    try {
        await run()
        console.log(`created  ${label}`)
    } catch (error) {
        if (!alreadyExists(error)) throw error
        console.log(`exists   ${label}`)
    }
}

// Attributes are created asynchronously; indexes can only be added once they are available
const waitForAttributes = async (collectionId: string, keys: string[]) => {
    for (let attempt = 0; attempt < 60; attempt++) {
        const { attributes } = await databases.listAttributes(databaseId, collectionId)
        const pending = keys.filter((k) => {
            const attribute = attributes.find((a) => (a as { key: string }).key === k) as { status?: string } | undefined
            return attribute?.status !== "available"
        })
        if (pending.length === 0) return
        await new Promise((r) => setTimeout(r, 1000))
    }
    throw new Error(`Attributes on ${collectionId} did not become available`)
}

const main = async () => {
    // Reuse the files collection's permission model so folders behave the same way
    const files = await databases.getCollection(databaseId, filesCollectionId)

    await step(`collection ${foldersCollectionId}`, () =>
        databases.createCollection(databaseId, foldersCollectionId, "folders", files.$permissions, files.documentSecurity))

    await step("folders.name", () => databases.createStringAttribute(databaseId, foldersCollectionId, "name", 255, true))
    await step("folders.parentId", () => databases.createStringAttribute(databaseId, foldersCollectionId, "parentId", 36, false))
    await step("folders.ancestors", () => databases.createStringAttribute(databaseId, foldersCollectionId, "ancestors", 36, false, undefined, true))
    await step("folders.ownerId", () => databases.createStringAttribute(databaseId, foldersCollectionId, "ownerId", 36, true))
    await step("folders.accountId", () => databases.createStringAttribute(databaseId, foldersCollectionId, "accountId", 36, true))
    await step("folders.users", () => databases.createStringAttribute(databaseId, foldersCollectionId, "users", 320, false, undefined, true))

    await step("files.folderId", () => databases.createStringAttribute(databaseId, filesCollectionId, "folderId", 36, false))

    await waitForAttributes(foldersCollectionId, ["name", "parentId", "ancestors", "ownerId", "accountId", "users"])
    await waitForAttributes(filesCollectionId, ["folderId"])

    await step("index folders.owner_parent", () =>
        databases.createIndex(databaseId, foldersCollectionId, "owner_parent", IndexType.Key, ["ownerId", "parentId"]))
    // folders.ancestors is an array, which Appwrite can't index; contains queries on it still work unindexed
    // files.ownerId is a relationship, which Appwrite can't index, so this index covers folderId alone
    await step("index files.folder", () =>
        databases.createIndex(databaseId, filesCollectionId, "folder", IndexType.Key, ["folderId"]))

    console.log(`\nDone. Set NEXT_PUBLIC_APPWRITE_FOLDERS_COLLECTION=${foldersCollectionId} in .env.local`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
