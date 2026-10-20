import React, { Suspense } from 'react'
import SearchFilterBar from '@/components/search/SearchFilterBar'
import SearchResults from '@/components/search/SearchResults'
import { ListSkeleton } from '@/components/ui/skeleton'
import { searchItems } from '@/lib/appwrite/actions/discover'
import { parseFilters, SearchFilters } from '@/lib/search'

export const dynamic = 'force-dynamic'

const Results = async ({ filters }: { filters: SearchFilters }) => {
    const { hits, hasMore } = await searchItems(filters)
    return <SearchResults hits={hits} filters={filters} hasMore={hasMore} />
}

const SearchPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
    const filters = parseFilters(await searchParams)
    return (
        <div className='page-container'>
            <section className='w-full'>
                <h1 className='h1'>Search results</h1>
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
