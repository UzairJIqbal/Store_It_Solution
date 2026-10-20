'use client'
import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, SlidersHorizontal, X } from 'lucide-react'
import {
    DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup,
    DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
    EMPTY_FILTERS, hasFilters, LOCATION_OPTIONS, MODIFIED_OPTIONS, modifiedLabel, OWNER_OPTIONS, searchHref, SearchFilters,
    TYPE_OPTIONS, typeLabel,
} from '@/lib/search'
import AdvancedSearch from './AdvancedSearch'

export const Chip = ({ label, applied, onClear, children }: {
    label: string,
    applied: boolean,
    onClear: () => void,
    children: React.ReactNode,
}) => (
    <div className={cn('filter-chip', applied && 'filter-chip-applied')}>
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger className='filter-chip-trigger'>
                {applied && <Check className='size-4' aria-hidden />}
                <span className='max-w-[180px] truncate'>{label}</span>
                <ChevronDown className='size-4' aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start' className='browser-menu max-h-[60vh] overflow-y-auto'>{children}</DropdownMenuContent>
        </DropdownMenu>
        {applied && (
            <button type='button' className='filter-chip-clear' onClick={onClear} aria-label={`Remove filter: ${label}`}>
                <X className='size-3.5' aria-hidden />
            </button>
        )}
    </div>
)

const SearchFilterBar = ({ filters, children }: { filters: SearchFilters, children: React.ReactNode }) => {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [customOpen, setCustomOpen] = useState(false)
    const [advanced, setAdvanced] = useState(false)
    const [range, setRange] = useState({ from: filters.from ?? '', to: filters.to ?? '' })

    const apply = (change: Partial<SearchFilters>) =>
        startTransition(() => router.push(searchHref({ ...filters, ...change })))

    const toggleType = (value: SearchFilters['types'][0]) =>
        apply({ types: filters.types.includes(value) ? filters.types.filter((t) => t !== value) : [...filters.types, value] })

    // The chips change the URL inside a transition, so the old results stay on screen (dimmed) until the new ones arrive
    return (
        <>
            <div role='toolbar' aria-label='Filters' className='flex flex-wrap items-center gap-2'>
                <Chip label={typeLabel(filters.types)} applied={filters.types.length > 0} onClear={() => apply({ types: [] })}>
                    {TYPE_OPTIONS.map((o) => (
                        <DropdownMenuCheckboxItem key={o.value} checked={filters.types.includes(o.value)}
                            // Keeps the menu open so several types can be picked; each pick applies at once, as in Drive
                            onSelect={(e) => { e.preventDefault(); toggleType(o.value) }}>
                            {o.label}
                        </DropdownMenuCheckboxItem>
                    ))}
                </Chip>

                <Chip label={filters.owner === 'anyone' ? 'People' : OWNER_OPTIONS.find((o) => o.value === filters.owner)!.label}
                    applied={filters.owner !== 'anyone'} onClear={() => apply({ owner: 'anyone' })}>
                    <DropdownMenuRadioGroup value={filters.owner} onValueChange={(v) => apply({ owner: v as SearchFilters['owner'] })}>
                        {OWNER_OPTIONS.map((o) => <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>)}
                    </DropdownMenuRadioGroup>
                </Chip>

                <Chip label={modifiedLabel(filters)} applied={filters.modified !== null}
                    onClear={() => apply({ modified: null, from: null, to: null })}>
                    <DropdownMenuRadioGroup value={filters.modified ?? ''}
                        onValueChange={(v) => apply({ modified: v as SearchFilters['modified'], from: null, to: null })}>
                        {MODIFIED_OPTIONS.map((o) => <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>)}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => { setRange({ from: filters.from ?? '', to: filters.to ?? '' }); setCustomOpen(true) }}>
                        Custom date range…
                    </DropdownMenuItem>
                </Chip>

                <Chip label={filters.location === 'anywhere' ? 'Location' : LOCATION_OPTIONS.find((o) => o.value === filters.location)!.label}
                    applied={filters.location !== 'anywhere'} onClear={() => apply({ location: 'anywhere' })}>
                    <DropdownMenuRadioGroup value={filters.location} onValueChange={(v) => apply({ location: v as SearchFilters['location'] })}>
                        {LOCATION_OPTIONS.map((o) => <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>)}
                    </DropdownMenuRadioGroup>
                </Chip>

                {hasFilters(filters) && (
                    <button type='button' className='search-text-btn' onClick={() => apply({ ...EMPTY_FILTERS, q: filters.q })}>
                        Clear filters
                    </button>
                )}
                <button type='button' className='search-text-btn ml-auto' onClick={() => setAdvanced(true)}>
                    <SlidersHorizontal className='size-4' aria-hidden />Advanced
                </button>
            </div>

            <div className={cn('search-progress', pending && 'search-progress-active')} aria-hidden />
            <div aria-busy={pending} className={cn('transition-opacity duration-200', pending && 'pointer-events-none opacity-50')}>
                {children}
            </div>

            <Dialog open={customOpen} onOpenChange={setCustomOpen}>
                <DialogContent className='shad-dialog button max-w-[420px]'>
                    <form className='flex flex-col gap-5' onSubmit={(e) => {
                        e.preventDefault()
                        if (!range.from && !range.to) return
                        setCustomOpen(false)
                        apply({ modified: 'custom', from: range.from || null, to: range.to || null })
                    }}>
                        <DialogHeader>
                            <DialogTitle className='h3 text-light-100'>Custom date range</DialogTitle>
                            <DialogDescription className='body-2 text-light-200'>Leave one end empty for an open range.</DialogDescription>
                        </DialogHeader>
                        <div className='flex items-center gap-2'>
                            <input type='date' aria-label='After' className='advanced-control' value={range.from} max={range.to || undefined}
                                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
                            <span className='text-light-200'>–</span>
                            <input type='date' aria-label='Before' className='advanced-control' value={range.to} min={range.from || undefined}
                                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
                        </div>
                        <DialogFooter className='flex flex-row justify-end gap-3'>
                            <button type='button' className='search-text-btn' onClick={() => setCustomOpen(false)}>Cancel</button>
                            <button type='submit' className='primary-pill-btn' disabled={!range.from && !range.to}>Apply</button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AdvancedSearch open={advanced} onOpenChange={setAdvanced} />
        </>
    )
}

export default SearchFilterBar
