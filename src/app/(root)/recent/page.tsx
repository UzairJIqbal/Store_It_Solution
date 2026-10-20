import React from 'react'
import ActionDropdown from '@/components/ActionDropdown'
import Thumbnail from '@/components/Thumbnail'
import OpenFile from '@/components/lifecycle/OpenFile'
import { getRecent } from '@/lib/appwrite/actions/lifecycle.action'
import { REASON_LABEL } from '@/lib/recent'
import { formatDateTime, groupByRecency } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const RecentPage = async () => {
    const items = await getRecent()
    const groups = groupByRecency(items, (item) => item.at)

    return (
        <div className='page-container'>
            <section className='w-full'>
                <h1 className='h1'>Recent</h1>
                <p className='body-1 mt-2 text-light-200'>Files you opened, uploaded or changed, newest first.</p>
            </section>

            {items.length === 0 ? (
                <p className='empty-list'>Files you open or change will show up here</p>
            ) : (
                <div className='w-full'>
                    <div className='lifecycle-list-header md:grid-cols-[minmax(0,1fr)_200px_180px_40px]'>
                        <p className='subtitle-2'>Name</p>
                        <p className='subtitle-2'>Owner</p>
                        <p className='subtitle-2'>Last activity</p>
                        <span />
                    </div>
                    {groups.map(([group, rows]) => (
                        <section key={group} className='mt-4'>
                            <h2 className='subtitle-2 px-4 pb-2 text-light-200'>{group}</h2>
                            <ul className='flex flex-col gap-2'>
                                {rows.map(({ file, at, reason }, index) => (
                                    <li key={file.$id} className='lifecycle-row grid-cols-[minmax(0,1fr)_40px] md:grid-cols-[minmax(0,1fr)_200px_180px_40px]'>
                                        <OpenFile files={rows.map((r) => r.file)} index={index} className='flex min-w-0 cursor-pointer items-center gap-3'>
                                            <Thumbnail type={file.type} extension={file.extension} url={file.url} className='!size-10 shrink-0' imageClassName='!size-7' />
                                            <div className='min-w-0'>
                                                <p className='subtitle-2 truncate text-light-100'>{file.name}</p>
                                                <p className='caption truncate text-light-200 md:hidden'>{REASON_LABEL[reason]} · {formatDateTime(at)}</p>
                                            </div>
                                        </OpenFile>
                                        <p className='body-2 hidden truncate text-light-100 md:block'>{file.ownerId?.fullName ?? 'me'}</p>
                                        <div className='hidden min-w-0 md:block'>
                                            <p className='body-2 text-light-100'>{formatDateTime(at)}</p>
                                            <p className='caption text-light-200'>{REASON_LABEL[reason]}</p>
                                        </div>
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

export default RecentPage
