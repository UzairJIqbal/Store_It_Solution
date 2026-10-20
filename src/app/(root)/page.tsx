import React, { Suspense } from 'react'
import Link from 'next/link'
import { ChevronRight, Folder } from 'lucide-react'
import HomeSection from '@/components/home/HomeSection'
import SuggestedFiles from '@/components/home/SuggestedFiles'
import { ListSkeleton, Skeleton } from '@/components/ui/skeleton'
import { getRecent } from '@/lib/appwrite/actions/lifecycle.action'
import { getSuggestedFolders } from '@/lib/appwrite/actions/discover'
import { getTotalSpaceUsed } from '@/lib/appwrite/actions/file.action'
import { cn, convertFileSize, formatDateTime, formatUsagePercent, getUsageLevel } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const SUGGESTED_FILES = 10

const FolderCardsSkeleton = () => (
    <div role='status' aria-label='Loading suggested folders' className='home-folder-grid'>
        {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className='home-folder-card'>
                <Skeleton className='size-10 rounded-xl' />
                <div className='flex flex-1 flex-col gap-2'><Skeleton className='h-4 w-3/4' /><Skeleton className='h-3 w-1/2' /></div>
            </div>
        ))}
    </div>
)

const SuggestedFolders = async () => {
    const folders = await getSuggestedFolders()
    if (folders.length === 0) {
        return (
            <div className='home-empty'>
                <p className='subtitle-2 text-light-100'>No folders yet</p>
                <p className='body-2 text-light-200'>Create a folder in <Link href='/files' className='text-brand hover:underline'>My files</Link> and the ones you use most will appear here.</p>
            </div>
        )
    }
    return (
        <ul className='home-folder-grid'>
            {folders.map(({ folder, location, at }) => (
                <li key={folder.$id}>
                    <Link href={`/folders/${folder.$id}`} className='home-folder-card'>
                        <span className='search-folder-icon !size-10'><Folder className='size-5' aria-hidden /></span>
                        <span className='min-w-0'>
                            <span className='subtitle-2 block truncate text-light-100'>{folder.name}</span>
                            <span className='caption block truncate text-light-200'>In {location.label} · {formatDateTime(at)}</span>
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    )
}

const SuggestedFilesSection = async () => {
    const items = await getRecent()
    return <SuggestedFiles items={items.slice(0, SUGGESTED_FILES)} />
}

const StorageStrip = async () => {
    const { used, all } = await getTotalSpaceUsed()
    const percent = all > 0 ? Math.min((used / all) * 100, 100) : 0
    const level = getUsageLevel(percent)
    return (
        <Link href='/storage' className='home-storage-strip'>
            <div className='flex min-w-0 flex-1 flex-col gap-2'>
                <p className='subtitle-2 text-light-100'>
                    {convertFileSize(used)} of {convertFileSize(all)} used
                    <span className='font-normal text-light-200'> · {formatUsagePercent(percent)}</span>
                </p>
                <div className='storage-meter-track' aria-hidden>
                    <div className={cn('storage-meter-fill', { normal: 'bg-brand', warning: 'bg-orange', critical: 'bg-error' }[level])}
                        style={{ width: `${percent > 0 ? Math.max(percent, 1) : 0}%` }} />
                </div>
            </div>
            <span className='body-2 flex shrink-0 items-center gap-1 font-medium text-brand'>
                Manage storage<ChevronRight className='size-4' aria-hidden />
            </span>
        </Link>
    )
}

const Home = () => (
    <div className='page-container'>
        <section className='w-full'>
            <h1 className='h1'>Welcome to StoreIt</h1>
            <p className='body-1 mt-2 text-light-200'>Pick up where you left off.</p>
        </section>

        <HomeSection id='folders' title='Suggested folders'>
            <Suspense fallback={<FolderCardsSkeleton />}><SuggestedFolders /></Suspense>
        </HomeSection>

        <HomeSection id='files' title='Suggested files'>
            <Suspense fallback={<ListSkeleton rows={5} columns={3} label='Loading suggested files' />}><SuggestedFilesSection /></Suspense>
        </HomeSection>

        <Suspense fallback={<Skeleton className='h-[76px] w-full rounded-[18px]' />}><StorageStrip /></Suspense>
    </div>
)

export default Home
