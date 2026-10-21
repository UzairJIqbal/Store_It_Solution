import { cn } from '@/lib/utils'

// Grey placeholder blocks shown while a section loads; screen readers hear the region's "Loading" label instead
export const Skeleton = ({ className }: { className?: string }) => <div className={cn('skeleton', className)} aria-hidden />

export const RowSkeleton = ({ columns = 3 }: { columns?: number }) => (
    <div className='lifecycle-row grid-cols-[minmax(0,1fr)_40px] md:grid-cols-[minmax(0,1fr)_repeat(var(--cols),160px)_40px]'
        style={{ '--cols': columns - 1 } as React.CSSProperties}>
        <div className='flex items-center gap-3'>
            <Skeleton className='size-10 rounded-xl' />
            <Skeleton className='h-4 w-2/5' />
        </div>
        {Array.from({ length: columns - 1 }, (_, i) => <Skeleton key={i} className='hidden h-4 w-24 md:block' />)}
        <Skeleton className='size-6 rounded-full' />
    </div>
)

export const ListSkeleton = ({ rows = 6, columns = 3, label = 'Loading' }: { rows?: number, columns?: number, label?: string }) => (
    <div role='status' aria-label={label} className='lifecycle-list w-full'>
        {Array.from({ length: rows }, (_, i) => <RowSkeleton key={i} columns={columns} />)}
    </div>
)

export const PageSkeleton = ({ chips = 0, rows = 8, columns = 3 }: { chips?: number, rows?: number, columns?: number }) => (
    <div className='page-container'>
        <section className='flex w-full flex-col gap-3'>
            <Skeleton className='h-9 w-56' />
            <Skeleton className='h-4 w-80 max-w-full' />
        </section>
        {chips > 0 && (
            <div className='flex w-full gap-2'>
                {Array.from({ length: chips }, (_, i) => <Skeleton key={i} className='h-9 w-24 rounded-full' />)}
            </div>
        )}
        <ListSkeleton rows={rows} columns={columns} />
    </div>
)
