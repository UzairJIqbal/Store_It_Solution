import { NextRequest } from "next/server"
import { searchItems } from "@/lib/appwrite/actions/discover"
import { parseFilters } from "@/lib/search"

// Search-as-you-type goes through a route handler: a server action would wait behind any pending star, trash or upload
export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams
    const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 100)
    try {
        const result = await searchItems(parseFilters(params), { limit })
        return Response.json(result, { headers: { "Cache-Control": "no-store" } })
    } catch (error) {
        console.error("Search failed", error)
        return Response.json({ error: "Search failed" }, { status: 500 })
    }
}
