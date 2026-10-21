import React, { Suspense } from 'react'
import Link from 'next/link'
import { Copy, FileStack, HardDrive, Sparkles, Trash2 } from 'lucide-react'
import StorageLists from '@/components/storage/StorageLists'
import { SEGMENT_COLOR } from '@/components/storage/segments'
import StorageSkeleton from '@/components/storage/StorageSkeleton'
import { getStorageReport, StorageReport } from '@/lib/appwrite/actions/discover'
import { cn, convertFileSize, formatUsagePercent, getUsageLevel } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Storage' }

const Breakdown = ({ report }: { report: StorageReport }) => {
    const percent = report.limit > 0 ? Math.min((report.used / report.limit) * 100, 100) : 0
    const level = getUsageLevel(percent)
    const segments = report.segments.filter((s) => s.size > 0)
    return (
        <section className='storage-card' aria-labelledby='usage-title'>
            <h2 id='usage-title' className='sr-only'>Usage</h2>
            <p className='text-light-100'>
                <span className='text-[40px] font-semibold leading-none'>{convertFileSize(report.used)}</span>
                <span className='body-1 text-light-200'> of {convertFileSize(report.limit)} used</span>
            </p>
            <p className={cn('body-2 mt-1', level === 'critical' ? 'text-error' : 'text-light-200')}>
                {formatUsagePercent(percent)} of your storage
                {level === 'critical' ? ' — you are almost out of space' : level === 'warning' ? ' — getting full' : ''}
            </p>
            {/* The bar is a picture of the list below, which carries the numbers for screen readers */}
            <div className='storage-bar' aria-hidden>
                {segments.map((s) => (
                    <span key={s.key} style={{ width: `${Math.max((s.size / report.limit) * 100, 0.6)}%`, background: SEGMENT_COLOR[s.key] }} />
                ))}
            </div>
            <ul className='mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4'>
                {report.segments.map((s) => (
                    <li key={s.key} className='flex gap-3'>
                        <span className='mt-1.5 size-3 shrink-0 rounded-full' style={{ background: SEGMENT_COLOR[s.key] }} aria-hidden />
                        <div className='min-w-0'>
                            <p className='subtitle-2 text-light-100'>{s.label} <span className='font-normal text-light-200'>· {convertFileSize(s.size)}</span></p>
                            <p className='caption text-light-200'>{s.count} {s.count === 1 ? 'file' : 'files'} · {s.description}</p>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    )
}

const CleanupCards = ({ report }: { report: StorageReport }) => {
    const { large, trash, versions, duplicates } = report.cleanup
    const cards = [
        { key: 'large', show: large.count > 0, Icon: HardDrive, title: 'Large files', size: large.size,
            text: `${large.count} ${large.count === 1 ? 'file is' : 'files are'} ${convertFileSize(large.threshold)} or bigger.`, href: '#largest', cta: 'Review large files' },
        { key: 'trash', show: trash.count > 0, Icon: Trash2, title: 'Trash', size: trash.size,
            text: `${trash.count} ${trash.count === 1 ? 'item still counts' : 'items still count'} towards your storage until deleted.`, href: '/trash', cta: 'Review trash' },
        { key: 'versions', show: versions.count > 0, Icon: FileStack, title: 'Old versions', size: versions.size,
            text: `${versions.count} earlier ${versions.count === 1 ? 'version' : 'versions'} of ${versions.files.length} ${versions.files.length === 1 ? 'file' : 'files'}.`, href: '#versions', cta: 'Review versions' },
        { key: 'duplicates', show: duplicates.count > 0, Icon: Copy, title: 'Possible duplicates', size: duplicates.size,
            text: `${duplicates.count} extra ${duplicates.count === 1 ? 'copy' : 'copies'} with the same name and size.`, href: '#duplicates', cta: 'Review duplicates' },
    ].filter((c) => c.show)

    return (
        <section className='w-full' aria-labelledby='cleanup-title'>
            <h2 id='cleanup-title' className='h4 mb-3 text-light-100'>Clean up space</h2>
            {cards.length === 0 ? (
                <div className='home-empty flex-row items-center gap-4'>
                    <span className='empty-state-art !mb-0 !size-12'><Sparkles className='size-6' aria-hidden /></span>
                    <div>
                        <p className='subtitle-2 text-light-100'>Nothing to clean up</p>
                        <p className='body-2 text-light-200'>No large files, trash, old versions or duplicates are taking up space.</p>
                    </div>
                </div>
            ) : (
                <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
                    {cards.map(({ key, Icon, title, size, text, href, cta }) => (
                        <li key={key} className='storage-cleanup-card'>
                            <div className='flex items-center justify-between'>
                                <span className='search-folder-icon !size-10'><Icon className='size-5' aria-hidden /></span>
                                <span className='subtitle-1 text-light-100'>{convertFileSize(size)}</span>
                            </div>
                            <p className='subtitle-2 text-light-100'>{title}</p>
                            <p className='body-2 flex-1 text-light-200'>{text}</p>
                            <Link href={href} className='search-text-btn -ml-3 self-start'>{cta}</Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}

const StorageOverview = async () => {
    const report = await getStorageReport()
    return (
        <>
            <Breakdown report={report} />
            <CleanupCards report={report} />
            <StorageLists largest={report.largest} versions={report.cleanup.versions.files} duplicates={report.cleanup.duplicates.groups}
                largeThreshold={report.cleanup.large.threshold} />
        </>
    )
}

const StoragePage = () => (
    <div className='page-container'>
        <section className='w-full'>
            <h1 className='h1'>Storage</h1>
            <p className='body-1 mt-2 text-light-200'>What is using your space, and the quickest ways to free some up.</p>
        </section>
        <Suspense fallback={<StorageSkeleton />}><StorageOverview /></Suspense>
    </div>
)

export default StoragePage
