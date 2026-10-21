'use client'
import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { FileStack, Trash2 } from 'lucide-react'
import ActionDropdown, { trashFileWithUndo } from '@/components/ActionDropdown'
import Thumbnail from '@/components/Thumbnail'
import OpenFile from '@/components/lifecycle/OpenFile'
import { useLifecycle } from '@/components/lifecycle/LifecycleProvider'
import { convertFileSize, formatDateTime } from '@/lib/utils'
import type { DuplicateGroup, VersionedFile } from '@/lib/appwrite/actions/discover'
import { fileDocument } from '../../../types'

const ROW = 'lifecycle-row grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_120px_170px_auto]'

const FileCell = ({ files, index, subtitle }: { files: fileDocument[], index: number, subtitle: string }) => {
    const file = files[index]
    return (
        <OpenFile files={files} index={index} className='flex min-w-0 cursor-pointer items-center gap-3'>
            <Thumbnail type={file.type} extension={file.extension} url={file.url} className='!size-10 shrink-0' imageClassName='!size-7' />
            <div className='min-w-0'>
                <p className='subtitle-2 truncate text-light-100'>{file.name}</p>
                <p className='caption truncate text-light-200 md:hidden'>{subtitle}</p>
            </div>
        </OpenFile>
    )
}

const TrashButton = ({ file }: { file: fileDocument }) => {
    const router = useRouter()
    const path = usePathname()
    return (
        <button type='button' className='storage-row-btn' onClick={() => trashFileWithUndo(file, path, router.refresh)}
            aria-label={`Move ${file.name} to trash`} title='Move to trash'>
            <Trash2 className='size-4' aria-hidden />
        </button>
    )
}

const Section = ({ id, title, hint, children }: { id: string, title: string, hint: string, children: React.ReactNode }) => (
    <section id={id} className='w-full scroll-mt-6' aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} className='h4 text-light-100'>{title}</h2>
        <p className='body-2 mb-3 mt-1 text-light-200'>{hint}</p>
        {children}
    </section>
)

const ListHeader = ({ size = 'Size', date = 'Modified' }: { size?: string, date?: string }) => (
    <div className='lifecycle-list-header md:grid-cols-[minmax(0,1fr)_120px_170px_auto]' aria-hidden>
        <p className='subtitle-2'>Name</p>
        <p className='subtitle-2'>{size}</p>
        <p className='subtitle-2'>{date}</p>
        <span className='w-[88px]' />
    </div>
)

// Biggest files first, plus the files whose old versions or duplicate copies take space; each row can be trashed with Undo
const StorageLists = ({ largest, versions, duplicates, largeThreshold }: {
    largest: fileDocument[],
    versions: VersionedFile[],
    duplicates: DuplicateGroup[],
    largeThreshold: number,
}) => {
    const { openVersions } = useLifecycle()
    const versionFiles = versions.map((v) => v.file)

    return (
        <>
            <Section id='largest' title='Largest files'
                hint={`Sorted by size. Files of ${convertFileSize(largeThreshold)} or more are the quickest wins.`}>
                {largest.length === 0 ? (
                    <div className='home-empty'><p className='body-2 text-light-200'>You have no files yet. Uploads will be listed here by size.</p></div>
                ) : (
                    <>
                        <ListHeader />
                        <ul className='lifecycle-list mt-2'>
                            {largest.map((file, index) => (
                                <li key={file.$id} className={ROW}>
                                    <FileCell files={largest} index={index} subtitle={`${convertFileSize(file.size)} · ${formatDateTime(file.$updatedAt)}`} />
                                    <p className='body-2 hidden font-medium text-light-100 md:block'>{convertFileSize(file.size)}</p>
                                    <p className='body-2 hidden text-light-100 md:block'>{formatDateTime(file.$updatedAt)}</p>
                                    <div className='flex items-center gap-1'>
                                        <TrashButton file={file} />
                                        <ActionDropdown file={file} files={largest} index={index} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </Section>

            {versions.length > 0 && (
                <Section id='versions' title='Old versions'
                    hint='Every earlier version is kept and counts towards your storage. Delete the ones you no longer need.'>
                    <ListHeader size='Versions' date='Space used' />
                    <ul className='lifecycle-list mt-2'>
                        {versions.map(({ file, versions: count, size }, index) => (
                            <li key={file.$id} className={ROW}>
                                <FileCell files={versionFiles} index={index} subtitle={`${count} old · ${convertFileSize(size)}`} />
                                <p className='body-2 hidden text-light-100 md:block'>{count}</p>
                                <p className='body-2 hidden font-medium text-light-100 md:block'>{convertFileSize(size)}</p>
                                <button type='button' className='search-text-btn' onClick={() => openVersions(file)}>
                                    <FileStack className='size-4' aria-hidden />Manage
                                </button>
                            </li>
                        ))}
                    </ul>
                </Section>
            )}

            {duplicates.length > 0 && (
                <Section id='duplicates' title='Possible duplicates'
                    hint='These files share a name and size. Keep one copy and move the rest to the trash. The oldest copy is listed first.'>
                    <div className='flex flex-col gap-5'>
                        {duplicates.map((group) => (
                            <div key={group.files[0].$id}>
                                <p className='subtitle-2 mb-2 px-4 text-light-200'>
                                    {group.name} · {group.files.length} copies · {convertFileSize(group.size)} each
                                </p>
                                <ul className='lifecycle-list'>
                                    {group.files.map((file, index) => (
                                        <li key={file.$id} className={ROW}>
                                            <FileCell files={group.files} index={index} subtitle={`Uploaded ${formatDateTime(file.$createdAt)}`} />
                                            <p className='body-2 hidden text-light-100 md:block'>{index === 0 ? 'Oldest' : `Copy ${index + 1}`}</p>
                                            <p className='body-2 hidden text-light-100 md:block'>Uploaded {formatDateTime(file.$createdAt)}</p>
                                            <div className='flex items-center gap-1'>
                                                <TrashButton file={file} />
                                                <ActionDropdown file={file} files={group.files} index={index} />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </Section>
            )}
        </>
    )
}

export default StorageLists
