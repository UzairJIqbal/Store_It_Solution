// One-off data migration for sharing. Run after setup-sharing.ts with: bun scripts/migrate-sharing.ts
// - copies each files.users email into the shares collection as a viewer (lowercased)
// - lowercases users.email so sign-in and sharing compare emails the same way
// Safe to re-run: existing share rows are skipped. files.users itself is left in place.
import { AppwriteException, Client, Databases, ID, Query } from "node-appwrite"

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE
const usersCollectionId = process.env.NEXT_PUBLIC_APPWRITE_USERS_COLLECTION
const filesCollectionId = process.env.NEXT_PUBLIC_APPWRITE_FILES_COLLECTION
const sharesCollectionId = process.env.NEXT_PUBLIC_APPWRITE_SHARES_COLLECTION ?? "shares"
const key = process.env.APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !usersCollectionId || !filesCollectionId || !key) {
    console.error("Missing Appwrite env vars (endpoint, project, database, users/files collections, APPWRITE_KEY)")
    process.exit(1)
}

const databases = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(key))

const listAll = async (collectionId: string, queries: string[] = []) => {
    const documents: Record<string, any>[] = []
    let cursor: string | undefined
    while (true) {
        const page = await databases.listDocuments(databaseId, collectionId, [
            ...queries, Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ])
        documents.push(...page.documents)
        if (page.documents.length < 100) return documents
        cursor = page.documents[page.documents.length - 1].$id
    }
}

const ownerIdOf = (doc: Record<string, any>) => typeof doc.ownerId === "string" ? doc.ownerId : doc.ownerId?.$id

const main = async () => {
    const users = await listAll(usersCollectionId)
    const taken = new Set(users.map((u) => u.email))
    let lowered = 0
    for (const user of users) {
        const email = String(user.email).toLowerCase()
        if (email === user.email) continue
        if (taken.has(email)) {
            console.warn(`skipped  users ${user.$id}: another account already uses the lowercase email`)
            continue
        }
        await databases.updateDocument(databaseId, usersCollectionId, user.$id, { email })
        taken.add(email)
        lowered++
    }
    console.log(`lowercased ${lowered} user email(s)`)

    const files = await listAll(filesCollectionId)
    let created = 0, skipped = 0
    for (const file of files) {
        const ownerId = ownerIdOf(file)
        if (!ownerId) continue
        const emails = [...new Set(((file.users ?? []) as string[]).map((e) => e.trim().toLowerCase()).filter(Boolean))]
        for (const email of emails) {
            try {
                await databases.createDocument(databaseId, sharesCollectionId, ID.unique(), {
                    fileId: file.$id, ownerId, email, role: "viewer", sharedBy: ownerId,
                })
                created++
            } catch (error) {
                if (!(error instanceof AppwriteException && error.code === 409)) throw error
                skipped++
            }
        }
    }
    console.log(`shares: ${created} created, ${skipped} already there (from ${files.length} files)`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
