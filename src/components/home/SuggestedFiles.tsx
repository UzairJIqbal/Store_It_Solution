'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { LayoutGrid, List } from 'lucide-react'
import ActionDropdown from '@/components/ActionDropdown'
import Thumbnail from '@/components/Thumbnail'
import OpenFile from '@/components/lifecycle/OpenFile'
import { cn, formatDateTime } from '@/lib/utils'
import { REASON_LABEL } from '@/lib/recent'
import type { RecentItem } from '@/lib/appwrite/actions/lifecycle.action'

type View = 'list' | 'grid'
const VIEW_KEY = 'storeit:home-view'

export const ViewToggle = ({ view, onChange }: { view: View, onChange: (v: View) => void }) => (
    <div role='radiogroup' aria-label='Layout' className='view-toggle'>
        {([['list', List, 'List layout'], ['grid', LayoutGrid, 'Grid layout']] as const).map(([value, Icon, label]) => (
            <button key={value} type='button' role='radio' aria-checked={view === value} aria-label={label}
                className={cn('view-toggle-btn', view === value && 'view-toggle-btn-active')} onClick={() => onChange(value)}>
                <Icon className='size-4' aria-hidden />
            </button>
        ))}
    </div>
)

// Files I touched most recently, each with the reason it is suggested
const SuggestedFiles = ({ items }: { items: RecentItem[] }) => {
    const [view, setView] = useState<View>('list')
    const files = items.map((i) => i.file)

    useEffect(() => {
        try { if (localStorage.getItem(VIEW_KEY) === 'grid') setView('grid') } catch { /* default to list */ }
    }, [])

    const change = (v: View) => {
        setView(v)
        try { localStorage.setItem(VIEW_KEY, v) } catch { /* not remembered */ }
    }

    if (items.length === 0) {
        return (
            <div className='home-empty'>
                <p className='subtitle-2 text-light-100'>No suggestions yet</p>
                <p className='body-2 text-light-200'>Files you upload, open or share will show up here so you can get back to them quickly.</p>
            </div>
        )
    }

    return (
        <div className='w-full'>
            <div className='mb-3 flex justify-end'><ViewToggle view={view} onChange={change} /></div>
            {view === 'grid' ? (
                <ul className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
                    {items.map(({ file, at, reason }, index) => (
                        <li key={file.$id} className='home-file-card'>
                            <div className='flex items-center justify-between gap-2'>
                                <OpenFile files={files} index={index} className='flex min-w-0 flex-1 cursor-pointer items-center gap-2'>
                                    <Thumbnail type={file.type} extension={file.extension} url={file.url} className='!size-7 shrink-0' imageClassName='!size-5' />
                                    <p className='subtitle-2 truncate text-light-100'>{file.name}</p>
                                </OpenFile>
                                <ActionDropdown file={file} files={files} index={index} />
                            </div>
                            <OpenFile files={files} index={index} className='home-file-preview'>
                                <Thumbnail type={file.type} extension={file.extension} url={file.url} className='!size-full !rounded-xl'
                                    imageClassName={file.type === 'image' ? '!size-full !rounded-none !object-cover' : '!size-16'} />
                            </OpenFile>
                            <p className='caption truncate text-light-200'>{REASON_LABEL[reason]} · {formatDateTime(at)}</p>
                        </li>
                    ))}
                </ul>
            ) : (
                <>
                    <div className='lifecycle-list-header md:grid-cols-[minmax(0,1fr)_220px_160px_40px]' aria-hidden>
                        <p className='subtitle-2'>Name</p>
                        <p className='subtitle-2'>Reason suggested</p>
                        <p className='subtitle-2'>Owner</p>
                        <span />
                    </div>
                    <ul className='mt-2 flex flex-col gap-2'>
                        {items.map(({ file, at, reason }, index) => (
                            <li key={file.$id} className='lifecycle-row grid-cols-[minmax(0,1fr)_40px] md:grid-cols-[minmax(0,1fr)_220px_160px_40px]'>
                                <OpenFile files={files} index={index} className='flex min-w-0 cursor-pointer items-center gap-3'>
                                    <Thumbnail type={file.type} extension={file.extension} url={file.url} className='!size-10 shrink-0' imageClassName='!size-7' />
                                    <div className='min-w-0'>
                                        <p className='subtitle-2 truncate text-light-100'>{file.name}</p>
                                        <p className='caption truncate text-light-200 md:hidden'>{REASON_LABEL[reason]} · {formatDateTime(at)}</p>
                                    </div>
                                </OpenFile>
                                <p className='body-2 hidden truncate text-light-100 md:block'>
                                    {REASON_LABEL[reason]} <span className='text-light-200'>· {formatDateTime(at)}</span>
                                </p>
                                <p className='body-2 hidden truncate text-light-100 md:block'>{file.ownerId?.fullName ?? 'Me'}</p>
                                <ActionDropdown file={file} files={files} index={index} />
                            </li>
                        ))}
                    </ul>
                </>
            )}
            <div className='mt-4 flex justify-center'>
                <Link href='/recent' className='search-text-btn'>View more in Recent</Link>
            </div>
        </div>
    )
}

export default SuggestedFiles
