import React from 'react'
import ActionDropdown from '@/components/ActionDropdown'
import Thumbnail from '@/components/Thumbnail'
import { getSharedWithMe, SharedItem } from '@/lib/appwrite/actions/file.action'
import { formatDateTime, recencyGroup } from '@/lib/utils'
import OpenFile from '@/components/lifecycle/OpenFile'

export const dynamic = 'force-dynamic'

const SharedPage = async () => {
    const items = await getSharedWithMe()
    const now = new Date()
    const groups = new Map<string, SharedItem[]>()
    for (const item of items) {
        const group = recencyGroup(item.sharedAt, now)
        groups.set(group, [...(groups.get(group) ?? []), item])
    }

    return (
        <div className='page-container'>
            <section className='w-full'>
                <h1 className='h1'>Shared with me</h1>
                <p className='body-1 mt-2 text-light-200'>Files other people have shared with you, newest first.</p>
            </section>

            {items.length === 0 ? (
                <p className='empty-list'>Nothing has been shared with you yet</p>
            ) : (
                <div className='w-full'>
                    <div className='hidden grid-cols-[minmax(0,1fr)_200px_160px_40px] gap-4 border-b border-light-200/40 px-4 pb-3 text-light-200 md:grid'>
                        <p className='subtitle-2'>Name</p>
                        <p className='subtitle-2'>Shared by</p>
                        <p className='subtitle-2'>Date shared</p>
                        <span />
                    </div>
                    {[...groups.entries()].map(([group, rows]) => (
                        <section key={group} className='mt-4'>
                            <h2 className='subtitle-2 px-4 pb-2 text-light-200'>{group}</h2>
                            <ul className='flex flex-col gap-2'>
                                {rows.map(({ file, sharedBy, sharedAt }, index) => (
                                    <li key={file.$id} className='grid grid-cols-[minmax(0,1fr)_40px] items-center gap-4 rounded-[18px] bg-white px-4 py-3 md:grid-cols-[minmax(0,1fr)_200px_160px_40px]'>
                                        <OpenFile files={rows.map((r) => r.file)} index={index} className='flex min-w-0 cursor-pointer items-center gap-3'>
                                            <Thumbnail type={file.type} extension={file.extension} url={file.url} className='!size-10 shrink-0' imageClassName='!size-7' />
                                            <div className='min-w-0'>
                                                <p className='subtitle-2 truncate text-light-100'>{file.name}</p>
                                                <p className='caption truncate text-light-200 md:hidden'>
                                                    {sharedBy.name} · {formatDateTime(sharedAt)}
                                                </p>
                                            </div>
                                        </OpenFile>
                                        <div className='hidden min-w-0 md:block'>
                                            <p className='body-2 truncate text-light-100'>{sharedBy.name}</p>
                                            <p className='caption truncate text-light-200'>{sharedBy.email}</p>
                                        </div>
                                        <p className='body-2 hidden text-light-200 md:block'>{formatDateTime(sharedAt)}</p>
                                        <ActionDropdown file={file} files={rows.map((r) => r.file)} index={index} />
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </div>
    )
}

export default SharedPage
