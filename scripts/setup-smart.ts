// Smart tags schema: tags and extracted text on each file, both filled in the browser at upload time.
// Run after setup-lifecycle.ts with: bun scripts/setup-smart.ts
// Safe to re-run: existing attributes are skipped. Both fields are optional, so existing files stay valid.
import { AppwriteException, Client, Databases } from "node-appwrite"

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE
const filesCollectionId = process.env.NEXT_PUBLIC_APPWRITE_FILES_COLLECTION
const key = process.env.APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !filesCollectionId || !key) {
    console.error("Missing Appwrite env vars (endpoint, project, database, files collection, APPWRITE_KEY)")
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

const main = async () => {
    // Up to 12 short lowercase tags, e.g. "screenshot", "landscape", "blue", "invoice"
    await step("files.tags", () => databases.createStringAttribute(databaseId, filesCollectionId, "tags", 32, false, undefined, true))
    // The first 10,000 characters of text-like files, so search can look inside them
    await step("files.content", () => databases.createStringAttribute(databaseId, filesCollectionId, "content", 10000, false))
    console.log("Done")
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
