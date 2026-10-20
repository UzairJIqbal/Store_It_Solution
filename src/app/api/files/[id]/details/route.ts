import { getFileDetails } from "@/lib/appwrite/actions/lifecycle.action"

// Reads go through route handlers rather than server actions: server actions run one at a time
// per page, so the details panel would otherwise wait behind any pending star, trash or upload.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const result = await getFileDetails({ fileId: id })
    return Response.json(result, { status: result.ok ? 200 : 404, headers: { "Cache-Control": "no-store" } })
}
