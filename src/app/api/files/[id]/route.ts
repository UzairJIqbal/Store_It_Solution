import { NextRequest } from "next/server"
import { appwriteConfig } from "@/lib/appwrite/config"
import { createAdminClient } from "@/lib/appwrite"
import { getFileByLinkToken, requireFileAccess } from "@/lib/appwrite/actions/access"
import { fileDocument, FileVersionDocument } from "../../../../../types"

// The bucket is private, so every file byte comes through here after an access check:
// a signed-in user needs at least viewer access, or the request carries the file's public link token (?t=).
// ?version=<id> serves an old version to signed-in users with access; public links only ever get the current one.
const PASSED_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"]

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } })

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const token = request.nextUrl.searchParams.get("t")
    const download = request.nextUrl.searchParams.get("download") === "1"
    const versionId = request.nextUrl.searchParams.get("version")

    let file: fileDocument | null = null
    if (token) {
        const linked = await getFileByLinkToken(token)
        file = linked?.$id === id ? linked : null
    } else {
        // Missing, forbidden and signed-out all look the same, so file ids can't be probed
        file = await requireFileAccess(id, "viewer").then((r) => r.file, () => null)
    }
    if (!file) return notFound()

    let blob = { bucketFileId: file.bucketField, name: file.name }
    if (versionId) {
        if (token) return notFound()
        const { databases } = await createAdminClient()
        const version = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.fileVersionsCollectionId, versionId)
            .then((doc) => doc as unknown as FileVersionDocument, () => null)
        if (!version || version.fileId !== file.$id) return notFound()
        blob = { bucketFileId: version.bucketFileId, name: version.name }
    }

    const upstream = await fetch(
        `${appwriteConfig.endpointURL}/storage/buckets/${appwriteConfig.bucketId}/files/${blob.bucketFileId}/${download ? "download" : "view"}`,
        {
            headers: {
                "X-Appwrite-Project": appwriteConfig.projectId,
                "X-Appwrite-Key": appwriteConfig.secretKey,
                // Pass Range through so video and audio can seek
                ...(request.headers.get("range") ? { Range: request.headers.get("range")! } : {}),
            },
            cache: "no-store",
        },
    )
    if (!upstream.ok || !upstream.body) {
        if (upstream.status !== 404) console.error("Storage read failed", file.$id, upstream.status)
        return upstream.status === 416 ? new Response(null, { status: 416 }) : notFound()
    }

    const headers = new Headers()
    for (const name of PASSED_HEADERS) {
        const value = upstream.headers.get(name)
        if (value) headers.set(name, value)
    }
    // fetch() decodes a compressed (e.g. brotli) upstream body, but content-length still gives the compressed size;
    // passing it on makes browsers cut the file short
    if (upstream.headers.get("content-encoding")) headers.delete("content-length")
    const filename = encodeURIComponent(blob.name).replace(/['()]/g, escape)
    headers.set("Content-Disposition", `${download ? "attachment" : "inline"}; filename*=UTF-8''${filename}`)
    // Access is checked on every request, so a revoked user or a disabled link stops working at once
    headers.set("Cache-Control", "private, no-cache")
    // Uploaded HTML or SVG must not run as this site. PDFs are exempt because the browser's viewer won't load in a sandbox
    // and runs outside this origin anyway.
    if (!headers.get("content-type")?.startsWith("application/pdf")) {
        headers.set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'")
    }
    headers.set("X-Content-Type-Options", "nosniff")
    headers.set("Referrer-Policy", "no-referrer")

    return new Response(upstream.body, { status: upstream.status, headers })
}
