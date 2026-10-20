// Lifecycle schema (docs/lifecycle-research/plan.md): per-user file state (star, last opened), trash fields on files
// and folders, file versions, and an activity log. Run after setup-sharing.ts with: bun scripts/setup-lifecycle.ts
// Safe to re-run: existing resources are skipped. Only adds things; every new field is optional or has a default.
import { AppwriteException, Client, Databases, IndexType } from "node-appwrite"

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE
const filesCollectionId = process.env.NEXT_PUBLIC_APPWRITE_FILES_COLLECTION
const foldersCollectionId = process.env.NEXT_PUBLIC_APPWRITE_FOLDERS_COLLECTION
const fileStatesCollectionId = process.env.NEXT_PUBLIC_APPWRITE_FILE_STATES_COLLECTION ?? "fileStates"
const fileVersionsCollectionId = process.env.NEXT_PUBLIC_APPWRITE_FILE_VERSIONS_COLLECTION ?? "fileVersions"
const activityCollectionId = process.env.NEXT_PUBLIC_APPWRITE_ACTIVITY_COLLECTION ?? "activity"
const key = process.env.APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !filesCollectionId || !foldersCollectionId || !key) {
    console.error("Missing Appwrite env vars (endpoint, project, database, files/folders collections, APPWRITE_KEY)")
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

const ACTIONS = [
    "upload", "rename", "move", "share", "unshare", "role", "link", "transfer",
    "trash", "restore", "version", "version_delete",
]

const main = async () => {
    // §1 One row per (user, file): star and last opened belong to each person, not to the file
    await step(`collection ${fileStatesCollectionId}`, () =>
        databases.createCollection(databaseId, fileStatesCollectionId, "fileStates", [], false))
    await step("fileStates.userId", () => databases.createStringAttribute(databaseId, fileStatesCollectionId, "userId", 36, true))
    await step("fileStates.fileId", () => databases.createStringAttribute(databaseId, fileStatesCollectionId, "fileId", 36, true))
    await step("fileStates.isStarred", () => databases.createBooleanAttribute(databaseId, fileStatesCollectionId, "isStarred", false, false))
    await step("fileStates.starredAt", () => databases.createDatetimeAttribute(databaseId, fileStatesCollectionId, "starredAt", false))
    await step("fileStates.lastOpenedAt", () => databases.createDatetimeAttribute(databaseId, fileStatesCollectionId, "lastOpenedAt", false))

    // §2 Trash: the same three fields on files and folders
    for (const collectionId of [filesCollectionId, foldersCollectionId]) {
        await step(`${collectionId}.trashedAt`, () => databases.createDatetimeAttribute(databaseId, collectionId, "trashedAt", false))
        await step(`${collectionId}.trashedBy`, () => databases.createStringAttribute(databaseId, collectionId, "trashedBy", 36, false))
        await step(`${collectionId}.trashedRoot`, () => databases.createStringAttribute(databaseId, collectionId, "trashedRoot", 36, false))
    }

    // §3 Versions: the files document is always the current version; older blobs live here
    await step(`collection ${fileVersionsCollectionId}`, () =>
        databases.createCollection(databaseId, fileVersionsCollectionId, "fileVersions", [], false))
    await step("fileVersions.fileId", () => databases.createStringAttribute(databaseId, fileVersionsCollectionId, "fileId", 36, true))
    await step("fileVersions.bucketFileId", () => databases.createStringAttribute(databaseId, fileVersionsCollectionId, "bucketFileId", 36, true))
    await step("fileVersions.name", () => databases.createStringAttribute(databaseId, fileVersionsCollectionId, "name", 255, true))
    await step("fileVersions.size", () => databases.createIntegerAttribute(databaseId, fileVersionsCollectionId, "size", true, 0))
    await step("fileVersions.extension", () => databases.createStringAttribute(databaseId, fileVersionsCollectionId, "extension", 50, false))
    await step("fileVersions.uploadedBy", () => databases.createStringAttribute(databaseId, fileVersionsCollectionId, "uploadedBy", 36, true))
    await step("fileVersions.uploadedAt", () => databases.createDatetimeAttribute(databaseId, fileVersionsCollectionId, "uploadedAt", true))
    await step("fileVersions.number", () => databases.createIntegerAttribute(databaseId, fileVersionsCollectionId, "number", true, 1))
    await step("files.versionCount", () => databases.createIntegerAttribute(databaseId, filesCollectionId, "versionCount", false, 1, undefined, 1))
    await step("files.currentVersionAt", () => databases.createDatetimeAttribute(databaseId, filesCollectionId, "currentVersionAt", false))

    // §4 Activity: append-only, one row per change
    await step(`collection ${activityCollectionId}`, () =>
        databases.createCollection(databaseId, activityCollectionId, "activity", [], false))
    await step("activity.fileId", () => databases.createStringAttribute(databaseId, activityCollectionId, "fileId", 36, false))
    await step("activity.folderId", () => databases.createStringAttribute(databaseId, activityCollectionId, "folderId", 36, false))
    await step("activity.actorId", () => databases.createStringAttribute(databaseId, activityCollectionId, "actorId", 36, true))
    await step("activity.actorName", () => databases.createStringAttribute(databaseId, activityCollectionId, "actorName", 255, true))
    await step("activity.action", () => databases.createEnumAttribute(databaseId, activityCollectionId, "action", ACTIONS, true))
    await step("activity.detail", () => databases.createStringAttribute(databaseId, activityCollectionId, "detail", 1000, false))

    await waitForAttributes(fileStatesCollectionId, ["userId", "fileId", "isStarred", "starredAt", "lastOpenedAt"])
    await waitForAttributes(filesCollectionId, ["trashedAt", "trashedBy", "trashedRoot", "versionCount", "currentVersionAt"])
    await waitForAttributes(foldersCollectionId, ["trashedAt", "trashedBy", "trashedRoot"])
    await waitForAttributes(fileVersionsCollectionId, ["fileId", "bucketFileId", "name", "size", "extension", "uploadedBy", "uploadedAt", "number"])
    await waitForAttributes(activityCollectionId, ["fileId", "folderId", "actorId", "actorName", "action", "detail"])

    await step("index fileStates.user_file", () =>
        databases.createIndex(databaseId, fileStatesCollectionId, "user_file", IndexType.Unique, ["userId", "fileId"]))
    await step("index fileStates.user_starred", () =>
        databases.createIndex(databaseId, fileStatesCollectionId, "user_starred", IndexType.Key, ["userId", "isStarred"]))
    await step("index fileStates.user_opened", () =>
        databases.createIndex(databaseId, fileStatesCollectionId, "user_opened", IndexType.Key, ["userId", "lastOpenedAt"]))
    await step("index fileStates.fileId", () =>
        databases.createIndex(databaseId, fileStatesCollectionId, "fileId", IndexType.Key, ["fileId"]))
    // files.ownerId is a relationship and can't be indexed; files.accountId always matches the owner
    await step("index files.owner_trashed", () =>
        databases.createIndex(databaseId, filesCollectionId, "owner_trashed", IndexType.Key, ["accountId", "trashedAt"]))
    await step("index folders.owner_trashed", () =>
        databases.createIndex(databaseId, foldersCollectionId, "owner_trashed", IndexType.Key, ["ownerId", "trashedAt"]))
    for (const collectionId of [filesCollectionId, foldersCollectionId]) {
        await step(`index ${collectionId}.trashedAt`, () =>
            databases.createIndex(databaseId, collectionId, "trashedAt", IndexType.Key, ["trashedAt"]))
    }
    await step("index fileVersions.file_number", () =>
        databases.createIndex(databaseId, fileVersionsCollectionId, "file_number", IndexType.Key, ["fileId", "number"]))
    await step("index fileVersions.uploadedAt", () =>
        databases.createIndex(databaseId, fileVersionsCollectionId, "uploadedAt", IndexType.Key, ["uploadedAt"]))
    // Old versions expire 30 days after they stop being current, which is when their row is created
    await step("index fileVersions.created", () =>
        databases.createIndex(databaseId, fileVersionsCollectionId, "created", IndexType.Key, ["$createdAt"]))
    await step("index fileVersions.bucketFileId", () =>
        databases.createIndex(databaseId, fileVersionsCollectionId, "bucketFileId", IndexType.Key, ["bucketFileId"]))
    // Recent: the caller's own uploads and edits
    await step("index activity.actor_created", () =>
        databases.createIndex(databaseId, activityCollectionId, "actor_created", IndexType.Key, ["actorId", "$createdAt"]))
    await step("index activity.file_created", () =>
        databases.createIndex(databaseId, activityCollectionId, "file_created", IndexType.Key, ["fileId", "$createdAt"]))
    await step("index activity.folder_created", () =>
        databases.createIndex(databaseId, activityCollectionId, "folder_created", IndexType.Key, ["folderId", "$createdAt"]))
    await step("index activity.created", () =>
        databases.createIndex(databaseId, activityCollectionId, "created", IndexType.Key, ["$createdAt"]))

    console.log("\nDone.")
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
