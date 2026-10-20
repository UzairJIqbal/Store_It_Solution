import { markOpened } from "@/lib/appwrite/actions/lifecycle.action"

// Records that the signed-in user opened a file (for Recent and "Opened by me").
// A plain request rather than a server action: server actions run one at a time per page,
// so a slow open record would hold up the viewer's details, star and trash calls behind it.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const result = await markOpened({ fileId: id })
    return Response.json(result, { status: result.ok ? 200 : 404, headers: { "Cache-Control": "no-store" } })
}
