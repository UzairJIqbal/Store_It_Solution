import React from 'react'
import Link from 'next/link'
import ActionDropdown from '@/components/ActionDropdown'
import Thumbnail from '@/components/Thumbnail'
import OpenFile from '@/components/lifecycle/OpenFile'
import { getStarred, StarredSort } from '@/lib/appwrite/actions/lifecycle.action'
import { cn, convertFileSize, formatDateTime } from '@/lib/utils'
import EmptyState from '@/components/EmptyState'
import { Star } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Starred' }

const SORTS: { value: StarredSort, label: string }[] = [
    { value: 'starred', label: 'Date starred' },
    { value: 'modified', label: 'Last modified' },
    { value: 'name', label: 'Name' },
]

const StarredPage = async ({ searchParams }: { searchParams: Promise<{ sort?: string }> }) => {
    const { sort: requested } = await searchParams
    const sort = SORTS.find((s) => s.value === requested)?.value ?? 'starred'
    const items = await getStarred({ sort })
    const files = items.map((i) => i.file)

    return (
        <div className='page-container'>
            <section className='flex w-full flex-wrap items-end justify-between gap-4'>
                <div>
                    <h1 className='h1'>Starred</h1>
                    <p className='body-1 mt-2 text-light-200'>Files you starred. Stars are only visible to you.</p>
                </div>
                <nav className='view-toggle' aria-label='Sort starred files'>
                    {SORTS.map((s) => (
                        <Link
                            key={s.value}
                            href={s.value === 'starred' ? '/starred' : `/starred?sort=${s.value}`}
                            className={cn('body-2 rounded-full px-4 py-1.5 text-light-200 transition-colors hover:text-light-100', sort === s.value && 'view-toggle-btn-active')}
                            aria-current={sort === s.value ? 'true' : undefined}
                        >
                            {s.label}
                        </Link>
                    ))}
                </nav>
            </section>

            {items.length === 0 ? (
                <EmptyState icon={Star} title='No starred files yet' action={{ href: '/files', label: 'Go to My Files' }}>
                    Star the files you come back to most. Open a file&apos;s ⋮ menu and choose Add to Starred, and it will wait for you here.
                </EmptyState>
            ) : (
                <div className='w-full'>
                    <div className='lifecycle-list-header md:grid-cols-[minmax(0,1fr)_200px_180px_96px_40px]'>
                        <p className='subtitle-2'>Name</p>
                        <p className='subtitle-2'>Owner</p>
                        <p className='subtitle-2'>{sort === 'starred' ? 'Date starred' : 'Last modified'}</p>
                        <p className='subtitle-2'>Size</p>
                        <span />
                    </div>
                    <ul className='lifecycle-list mt-4'>
                        {items.map(({ file, starredAt }, index) => (
                            <li key={file.$id} className='lifecycle-row grid-cols-[minmax(0,1fr)_40px] md:grid-cols-[minmax(0,1fr)_200px_180px_96px_40px]'>
                                <OpenFile files={files} index={index} className='flex min-w-0 cursor-pointer items-center gap-3'>
                                    <Thumbnail type={file.type} extension={file.extension} url={file.url} className='!size-10 shrink-0' imageClassName='!size-7' />
                                    <p className='subtitle-2 truncate text-light-100'>{file.name}</p>
                                </OpenFile>
                                <p className='body-2 hidden truncate text-light-100 md:block'>{file.ownerId?.fullName ?? 'me'}</p>
                                <p className='body-2 hidden text-light-200 md:block'>{formatDateTime(sort === 'starred' ? starredAt : file.$updatedAt)}</p>
                                <p className='body-2 hidden text-light-200 md:block'>{convertFileSize(file.size)}</p>
                                <ActionDropdown file={file} files={files} index={index} />
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}

export default StarredPage
