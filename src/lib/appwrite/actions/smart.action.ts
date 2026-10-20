'use server'

import { createAdminClient } from ".."
import { appwriteConfig } from "../config"
import { sanitizeSmart } from "@/lib/smart/sanitize"
import { ActionResult, revalidateBrowser } from "./shared"
import { AccessError, requireFileAccess } from "./access"

// Saves tags for a file uploaded before smart tags existed (the Scan button in Details). Editors and owners only.
export const saveSmartInfo = async ({ fileId, smart, path }: {
    fileId: string,
    smart: { tags: string[], content: string | null },
    path: string,
}): Promise<ActionResult<{ tags: string[] }>> => {
    try {
        const { file } = await requireFileAccess(fileId, "editor")
        const info = sanitizeSmart(smart)
        if (!info) return { ok: false, error: "Nothing to save" }
        const { databases } = await createAdminClient()
        await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, file.$id, {
            tags: info.tags,
            content: info.content,
        })
        revalidateBrowser(path)
        return { ok: true, data: { tags: info.tags } }
    } catch (error) {
        if (error instanceof AccessError) return { ok: false, error: error.message }
        console.error("Failed to save smart tags", error)
        return { ok: false, error: "Couldn't save the tags" }
    }
}
