// One-off Appwrite setup for the database, users/files collections and storage bucket.
// Run with: bun scripts/setup-appwrite.ts, then bun scripts/setup-folders.ts
// Bun loads .env / .env.local automatically. Safe to re-run: existing resources are skipped.
import { AppwriteException, Client, Databases, IndexType, Permission, RelationshipType, Role, Storage } from "node-appwrite"

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE
const usersCollectionId = process.env.NEXT_PUBLIC_APPWRITE_USERS_COLLECTION
const filesCollectionId = process.env.NEXT_PUBLIC_APPWRITE_FILES_COLLECTION
const bucketId = process.env.NEXT_PUBLIC_APPWRITE_BUCKET
const key = process.env.APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !usersCollectionId || !filesCollectionId || !bucketId || !key) {
    console.error("Missing Appwrite env vars (endpoint, project, database, users/files collections, bucket, APPWRITE_KEY)")
    process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(key)
const databases = new Databases(client)
const storage = new Storage(client)

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
    // On the free plan a duplicate create fails with a plan-limit 403 rather than 409, so check first
    await step(`database ${databaseId}`, () =>
        databases.get(databaseId).then(
            () => { throw new AppwriteException("exists", 409) },
            () => databases.create(databaseId, "storeit")))

    // All database access goes through the admin client, so collections grant no client permissions
    await step(`collection ${usersCollectionId}`, () =>
        databases.createCollection(databaseId, usersCollectionId, "users", [], false))
    await step("users.fullName", () => databases.createStringAttribute(databaseId, usersCollectionId, "fullName", 255, true))
    await step("users.email", () => databases.createEmailAttribute(databaseId, usersCollectionId, "email", true))
    await step("users.avatar", () => databases.createUrlAttribute(databaseId, usersCollectionId, "avatar", false))
    await step("users.accountId", () => databases.createStringAttribute(databaseId, usersCollectionId, "accountId", 36, true))
    await step("users.otp", () => databases.createStringAttribute(databaseId, usersCollectionId, "otp", 10, false))
    await step("users.expireAt", () => databases.createDatetimeAttribute(databaseId, usersCollectionId, "expireAt", false))

    await step(`collection ${filesCollectionId}`, () =>
        databases.createCollection(databaseId, filesCollectionId, "files", [], false))
    await step("files.name", () => databases.createStringAttribute(databaseId, filesCollectionId, "name", 255, true))
    await step("files.type", () =>
        databases.createEnumAttribute(databaseId, filesCollectionId, "type", ["document", "image", "video", "audio", "other"], true))
    await step("files.url", () => databases.createUrlAttribute(databaseId, filesCollectionId, "url", true))
    await step("files.size", () => databases.createIntegerAttribute(databaseId, filesCollectionId, "size", true))
    await step("files.extension", () => databases.createStringAttribute(databaseId, filesCollectionId, "extension", 50, false))
    await step("files.accountId", () => databases.createStringAttribute(databaseId, filesCollectionId, "accountId", 36, true))
    await step("files.users", () => databases.createStringAttribute(databaseId, filesCollectionId, "users", 320, false, undefined, true))
    await step("files.bucketField", () => databases.createStringAttribute(databaseId, filesCollectionId, "bucketField", 36, true))
    // Files expose their owner's user document as ownerId
    await step("files.ownerId", () =>
        databases.createRelationshipAttribute(databaseId, filesCollectionId, usersCollectionId, RelationshipType.ManyToOne, false, "ownerId"))

    await waitForAttributes(usersCollectionId, ["email"])
    await waitForAttributes(filesCollectionId, ["name", "type", "users"])

    await step("index users.email", () =>
        databases.createIndex(databaseId, usersCollectionId, "email", IndexType.Unique, ["email"]))
    await step("index files.name", () =>
        databases.createIndex(databaseId, filesCollectionId, "name_search", IndexType.Fulltext, ["name"]))
    await step("index files.type", () =>
        databases.createIndex(databaseId, filesCollectionId, "type", IndexType.Key, ["type"]))
    // files.users is an array, which Appwrite can't index; contains queries on it still work unindexed

    // File URLs are opened directly by the browser without an Appwrite session, so they must be publicly readable.
    // Browsers upload straight to the bucket with a short-lived JWT, so signed-in users may create files.
    // 50 MB is the Free plan's per-file maximum.
    await step(`bucket ${bucketId}`, () =>
        storage.createBucket(bucketId, "storeit files", [Permission.read(Role.any()), Permission.create(Role.users())], false, true, 50_000_000))

    console.log("\nDone. Now run: bun scripts/setup-folders.ts")
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
