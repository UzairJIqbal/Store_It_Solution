// Drop links schema: a public page where anyone can upload files into one of your folders.
// Run after setup-smart.ts with: bun scripts/setup-drops.ts
// Safe to re-run: existing resources are skipped. Only adds a new collection; nothing existing changes.
import { AppwriteException, Client, Databases, IndexType } from "node-appwrite"

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE
const dropsCollectionId = process.env.NEXT_PUBLIC_APPWRITE_DROPS_COLLECTION ?? "drops"
const key = process.env.APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !key) {
    console.error("Missing Appwrite env vars (endpoint, project, database, APPWRITE_KEY)")
    process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(key)
const databases = new Databases(client)

const step = async (label: string, run: () => Promise<unknown>) => {
    try {
        await run()
        console.log(`created  ${label}`)
    } catch (error) {
        if (!(error instanceof AppwriteException && error.code === 409)) throw error
        console.log(`exists   ${label}`)
    }
}

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
    // Server-only, like every other collection: no client permissions, the admin key does all reads and writes
    await step(`collection ${dropsCollectionId}`, () =>
        databases.createCollection(databaseId, dropsCollectionId, "drops", [], false))
    const c = dropsCollectionId
    await step("drops.ownerId", () => databases.createStringAttribute(databaseId, c, "ownerId", 36, true))
    await step("drops.accountId", () => databases.createStringAttribute(databaseId, c, "accountId", 36, true))
    // The secret part of the public link
    await step("drops.code", () => databases.createStringAttribute(databaseId, c, "code", 32, true))
    await step("drops.title", () => databases.createStringAttribute(databaseId, c, "title", 120, true))
    await step("drops.message", () => databases.createStringAttribute(databaseId, c, "message", 500, false))
    await step("drops.folderId", () => databases.createStringAttribute(databaseId, c, "folderId", 36, false))
    // An Appwrite Auth user that exists only to mint upload JWTs for strangers, so they never get the owner's
    await step("drops.uploaderId", () => databases.createStringAttribute(databaseId, c, "uploaderId", 36, true))
    await step("drops.enabled", () => databases.createBooleanAttribute(databaseId, c, "enabled", false, true))
    await step("drops.expiresAt", () => databases.createDatetimeAttribute(databaseId, c, "expiresAt", false))
    await step("drops.maxFiles", () => databases.createIntegerAttribute(databaseId, c, "maxFiles", false, 1, 1000, 100))
    await step("drops.filesReceived", () => databases.createIntegerAttribute(databaseId, c, "filesReceived", false, 0, 1_000_000, 0))
    await step("drops.lastReceivedAt", () => databases.createDatetimeAttribute(databaseId, c, "lastReceivedAt", false))

    await waitForAttributes(c, ["ownerId", "code"])
    await step("drops index code", () => databases.createIndex(databaseId, c, "code_unique", IndexType.Unique, ["code"]))
    await step("drops index ownerId", () => databases.createIndex(databaseId, c, "ownerId_key", IndexType.Key, ["ownerId"]))
    console.log("Done")
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
