// Daily cleanup (cron 0 3 * * *): permanently deletes what has passed its retention. See purge.js.
// The API key comes from the Function's own dynamic key (x-appwrite-key), limited to the scopes set when it was
// deployed, so no secret is stored in the Function.
import { Client, Databases, Storage } from "node-appwrite"
import { createPurger } from "./purge.js"

const BUDGET = 500

export default async ({ req, res, log, error }) => {
    const client = new Client()
        .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
        .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
        .setKey(req.headers["x-appwrite-key"] ?? "")

    const ids = {
        databaseId: process.env.STOREIT_DATABASE_ID,
        bucketId: process.env.STOREIT_BUCKET_ID,
        files: process.env.STOREIT_FILES_COLLECTION,
        folders: process.env.STOREIT_FOLDERS_COLLECTION,
        shares: process.env.STOREIT_SHARES_COLLECTION ?? "shares",
        fileStates: process.env.STOREIT_FILE_STATES_COLLECTION ?? "fileStates",
        fileVersions: process.env.STOREIT_FILE_VERSIONS_COLLECTION ?? "fileVersions",
        activity: process.env.STOREIT_ACTIVITY_COLLECTION ?? "activity",
    }
    if (!ids.databaseId || !ids.bucketId || !ids.files || !ids.folders) {
        error("Missing STOREIT_* variables")
        return res.json({ ok: false }, 500)
    }

    try {
        const purger = createPurger({ databases: new Databases(client), storage: new Storage(client), ids, budget: BUDGET })
        const result = await purger.purgeExpired()
        // Counts only: no names or ids of anyone's files go to the log
        log(JSON.stringify(result))
        return res.json({ ok: true, ...result })
    } catch (e) {
        error(e instanceof Error ? e.message : String(e))
        return res.json({ ok: false }, 500)
    }
}
