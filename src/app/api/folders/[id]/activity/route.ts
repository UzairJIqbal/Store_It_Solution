import { getActivity } from "@/lib/appwrite/actions/lifecycle.action"

// Activity history for a folder the signed-in user owns (see files/[id]/details/route.ts for why this isn't a server action)
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const result = await getActivity({ folderId: id })
    return Response.json(result, { status: result.ok ? 200 : 404, headers: { "Cache-Control": "no-store" } })
}
