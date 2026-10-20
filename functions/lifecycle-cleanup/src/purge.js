// Permanent deletion for StoreIt's trash, old versions and activity (docs/lifecycle-research/plan.md §5).
// Shared by the daily Appwrite Function (main.js) and the app's "Delete forever" / "Empty trash" actions,
// so both delete exactly the same things. Plain JavaScript so the Function can run it without a build step.
import { AppwriteException, Query } from "node-appwrite"

export const TRASH_DAYS = 30
export const VERSION_DAYS = 30
export const ACTIVITY_DAYS = 365
export const MAX_OLD_VERSIONS = 10

const PAGE = 100
const PARALLEL = 10
const DAY_MS = 24 * 60 * 60 * 1000

export const daysAgo = (days, now = Date.now()) => new Date(now - days * DAY_MS).toISOString()

const isNotFound = (error) => error instanceof AppwriteException && error.code === 404

/**
 * @param {{
 *   databases: import("node-appwrite").Databases,
 *   storage: import("node-appwrite").Storage,
 *   ids: { databaseId: string, bucketId: string, files: string, folders: string, shares: string,
 *          fileStates: string, fileVersions: string, activity: string },
 *   budget?: number,
 * }} options  budget caps the number of documents deleted, so one run stays inside the Function's time limit
 */
export const createPurger = ({ databases, storage, ids, budget = Infinity }) => {
    let left = budget
    let deleted = 0
    const exhausted = () => left <= 0

    const deleteBlob = (bucketFileId) =>
        storage.deleteFile(ids.bucketId, bucketFileId).catch((error) => {
            if (!isNotFound(error)) throw error
        })

    const deleteDoc = async (collectionId, id) => {
        left--
        deleted++
        await databases.deleteDocument(ids.databaseId, collectionId, id).catch((error) => {
            if (!isNotFound(error)) throw error
        })
    }

    // Deletes every match, always reading the first page because deleted rows drop out of the next read.
    // Returns false when the budget ran out first.
    const deleteWhere = async (collectionId, queries, before) => {
        while (!exhausted()) {
            const { documents } = await databases.listDocuments(ids.databaseId, collectionId, [
                ...queries,
                Query.limit(Math.min(PAGE, left)),
            ])
            for (let i = 0; i < documents.length; i += PARALLEL) {
                await Promise.all(documents.slice(i, i + PARALLEL).map(async (doc) => {
                    if (before) await before(doc)
                    await deleteDoc(collectionId, doc.$id)
                }))
            }
            if (documents.length < PAGE) return !exhausted() || documents.length === 0
        }
        return false
    }

    // A file goes last, after its versions, shares, per-user state and activity, so a run that stops
    // part way leaves it in the trash and the next run finishes it
    const purgeFile = async (file) => {
        const byFile = [Query.equal("fileId", [file.$id])]
        if (!await deleteWhere(ids.fileVersions, byFile, (v) => deleteBlob(v.bucketFileId))) return false
        if (!await deleteWhere(ids.shares, byFile)) return false
        if (!await deleteWhere(ids.fileStates, byFile)) return false
        if (!await deleteWhere(ids.activity, byFile)) return false
        if (exhausted()) return false
        await deleteBlob(file.bucketField)
        await deleteDoc(ids.files, file.$id)
        return true
    }

    // Only the folder's own events go; events of files that were in it stay with those files
    const purgeFolder = async (folder) => {
        if (!await deleteWhere(ids.activity, [Query.equal("folderId", [folder.$id]), Query.isNull("fileId")])) return false
        if (exhausted()) return false
        await deleteDoc(ids.folders, folder.$id)
        return true
    }

    const purgeFiles = async (files) => {
        for (const file of files) if (!await purgeFile(file)) return false
        return true
    }

    const purgeFolders = async (folders) => {
        for (const folder of folders) if (!await purgeFolder(folder)) return false
        return true
    }

    // Removes one old version and its bytes. The bytes stay when a file still points at them, so a version row
    // left behind by a failed replace can never take the current content with it.
    const purgeVersion = async (version) => {
        const current = await databases.listDocuments(ids.databaseId, ids.files, [
            Query.equal("bucketField", [version.bucketFileId]),
            Query.limit(1),
        ])
        if (current.total === 0) await deleteBlob(version.bucketFileId)
        await deleteDoc(ids.fileVersions, version.$id)
    }

    const listPage = async (collectionId, queries) =>
        (await databases.listDocuments(ids.databaseId, collectionId, [...queries, Query.limit(PAGE)])).documents

    /**
     * Everything past its retention: items trashed more than 30 days ago, old versions archived more than 30 days
     * ago, and activity older than a year. `owner` limits the trash part to one user (the Trash page backstop) and
     * skips the global parts.
     * @param {{ now?: number, owner?: { userId: string, accountId: string } }} [options]
     */
    const purgeExpired = async ({ now = Date.now(), owner } = {}) => {
        const trashCutoff = daysAgo(TRASH_DAYS, now)
        const counts = { files: 0, folders: 0, versions: 0, activity: 0 }
        const fileOwner = owner ? [Query.equal("accountId", [owner.accountId])] : []
        const folderOwner = owner ? [Query.equal("ownerId", [owner.userId])] : []

        while (!exhausted()) {
            const files = await listPage(ids.files, [...fileOwner, Query.lessThan("trashedAt", trashCutoff)])
            for (const file of files) {
                if (!await purgeFile(file)) return { ...counts, done: false, deleted }
                counts.files++
            }
            if (files.length < PAGE) break
        }
        while (!exhausted()) {
            const folders = await listPage(ids.folders, [...folderOwner, Query.lessThan("trashedAt", trashCutoff)])
            for (const folder of folders) {
                if (!await purgeFolder(folder)) return { ...counts, done: false, deleted }
                counts.folders++
            }
            if (folders.length < PAGE) break
        }
        if (owner) return { ...counts, done: !exhausted(), deleted }

        const versionCutoff = daysAgo(VERSION_DAYS, now)
        while (!exhausted()) {
            const versions = await listPage(ids.fileVersions, [Query.lessThan("$createdAt", versionCutoff)])
            for (const version of versions) {
                if (exhausted()) break
                await purgeVersion(version)
                counts.versions++
            }
            if (versions.length < PAGE) break
        }

        const before = deleted
        await deleteWhere(ids.activity, [Query.lessThan("$createdAt", daysAgo(ACTIVITY_DAYS, now))])
        counts.activity = deleted - before

        return { ...counts, done: !exhausted(), deleted }
    }

    return { purgeFile, purgeFolder, purgeFiles, purgeFolders, purgeVersion, purgeExpired, deleteWhere, get deleted() { return deleted } }
}
