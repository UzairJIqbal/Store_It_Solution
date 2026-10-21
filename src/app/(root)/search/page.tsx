import React, { Suspense } from 'react'
import SearchFilterBar from '@/components/search/SearchFilterBar'
import SearchResults from '@/components/search/SearchResults'
import { ListSkeleton } from '@/components/ui/skeleton'
import { searchItems } from '@/lib/appwrite/actions/discover'
import { parseFilters, SearchFilters, typeLabel } from '@/lib/search'

export const dynamic = 'force-dynamic'

const Results = async ({ filters }: { filters: SearchFilters }) => {
    const { hits, hasMore } = await searchItems(filters)
    return <SearchResults hits={hits} filters={filters} hasMore={hasMore} />
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

// Mirrors the page heading so browser tabs and history read "Documents · StoreIt" rather than "Search"
export const generateMetadata = async ({ searchParams }: { searchParams: SearchParams }) => {
    const filters = parseFilters(await searchParams)
    return { title: filters.q ? `“${filters.q}”` : filters.types.length ? typeLabel(filters.types) : 'Search' }
}

const SearchPage = async ({ searchParams }: { searchParams: SearchParams }) => {
    const filters = parseFilters(await searchParams)
    return (
        <div className='page-container'>
            <section className='w-full'>
                <h1 className='h1'>{filters.q ? 'Search results' : filters.types.length ? typeLabel(filters.types) : 'Search'}</h1>
                {filters.q && <p className='body-1 mt-2 text-light-200'>Names, tags and text inside files matching “{filters.q}”</p>}
            </section>
            <div className='flex w-full flex-col gap-4'>
                <SearchFilterBar filters={filters}>
                    <Suspense fallback={<ListSkeleton rows={6} columns={4} label='Searching' />}>
                        <Results filters={filters} />
                    </Suspense>
                </SearchFilterBar>
            </div>
        </div>
    )
}

export default SearchPage
