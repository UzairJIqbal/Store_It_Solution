// Sharing schema (docs/sharing-research/plan.md): shares collection, link fields on files, OTP attempt counter,
// and a private bucket. Run after setup-appwrite.ts and setup-folders.ts with: bun scripts/setup-sharing.ts
// Then run: bun scripts/migrate-sharing.ts
// Safe to re-run: existing resources are skipped and the bucket update is idempotent.
import { AppwriteException, Client, Databases, IndexType, Permission, Role, Storage } from "node-appwrite"

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE
const usersCollectionId = process.env.NEXT_PUBLIC_APPWRITE_USERS_COLLECTION
const filesCollectionId = process.env.NEXT_PUBLIC_APPWRITE_FILES_COLLECTION
const sharesCollectionId = process.env.NEXT_PUBLIC_APPWRITE_SHARES_COLLECTION ?? "shares"
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
    // One row per (file, person). Only the server reads or writes it, so no client permissions.
    await step(`collection ${sharesCollectionId}`, () =>
        databases.createCollection(databaseId, sharesCollectionId, "shares", [], false))
    await step("shares.fileId", () => databases.createStringAttribute(databaseId, sharesCollectionId, "fileId", 36, true))
    await step("shares.ownerId", () => databases.createStringAttribute(databaseId, sharesCollectionId, "ownerId", 36, true))
    await step("shares.email", () => databases.createStringAttribute(databaseId, sharesCollectionId, "email", 320, true))
    await step("shares.role", () => databases.createEnumAttribute(databaseId, sharesCollectionId, "role", ["viewer", "editor"], true))
    await step("shares.sharedBy", () => databases.createStringAttribute(databaseId, sharesCollectionId, "sharedBy", 36, true))

    await step("files.linkAccess", () =>
        databases.createEnumAttribute(databaseId, filesCollectionId, "linkAccess", ["restricted", "anyone"], false, "restricted"))
    await step("files.linkToken", () => databases.createStringAttribute(databaseId, filesCollectionId, "linkToken", 43, false))

    await step("users.otpAttempts", () =>
        databases.createIntegerAttribute(databaseId, usersCollectionId, "otpAttempts", false, 0, undefined, 0))

    await waitForAttributes(sharesCollectionId, ["fileId", "ownerId", "email", "role", "sharedBy"])
    await waitForAttributes(filesCollectionId, ["linkAccess", "linkToken"])
    await waitForAttributes(usersCollectionId, ["otpAttempts"])

    await step("index shares.file_email", () =>
        databases.createIndex(databaseId, sharesCollectionId, "file_email", IndexType.Unique, ["fileId", "email"]))
    await step("index shares.email", () =>
        databases.createIndex(databaseId, sharesCollectionId, "email", IndexType.Key, ["email"]))
    await step("index shares.fileId", () =>
        databases.createIndex(databaseId, sharesCollectionId, "fileId", IndexType.Key, ["fileId"]))
    await step("index files.linkToken", () =>
        databases.createIndex(databaseId, filesCollectionId, "linkToken", IndexType.Unique, ["linkToken"]))

    // File bytes are now served by /api/files/[id] after an access check, so the bucket is no longer public.
    // With file security on, each upload keeps the read permission its uploader gets, which chunked-upload resume needs.
    const bucket = await storage.getBucket(bucketId)
    await storage.updateBucket(
        bucketId,
        bucket.name,
        [Permission.create(Role.users())],
        true,
        bucket.enabled,
        bucket.maximumFileSize,
        bucket.allowedFileExtensions,
        bucket.compression as never,
        bucket.encryption,
        bucket.antivirus,
    )
    console.log("updated  bucket: create(users) only, file security on")

    console.log("\nDone. Now run: bun scripts/migrate-sharing.ts")
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
