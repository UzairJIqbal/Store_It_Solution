'use client'
import React, { useEffect, useId, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
    EMPTY_FILTERS, LOCATION_OPTIONS, MODIFIED_OPTIONS, OWNER_OPTIONS, parseFilters, rememberSearch, searchHref,
    SearchFilters, TYPE_OPTIONS,
} from '@/lib/search'

// Drive's "Advanced search" form, cut down to the filters StoreIt has. It writes the same URL as the chips.
const AdvancedSearch = ({ open, onOpenChange, initial }: {
    open: boolean,
    onOpenChange: (open: boolean) => void,
    // Defaults to the filters in the current URL
    initial?: Partial<SearchFilters>,
}) => {
    const router = useRouter()
    const params = useSearchParams()
    const id = useId()
    const [form, setForm] = useState<SearchFilters>(EMPTY_FILTERS)

    useEffect(() => {
        if (open) setForm(initial ? { ...EMPTY_FILTERS, ...initial } : parseFilters(params))
        // Only when the dialog opens
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const set = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => setForm((f) => ({ ...f, [key]: value }))
    const customInvalid = form.modified === 'custom' && !form.from && !form.to

    const submit = (e: React.FormEvent) => {
        e.preventDefault()
        if (customInvalid) return
        rememberSearch(form.q)
        onOpenChange(false)
        router.push(searchHref(form))
    }

    const field = (label: string, key: string, control: React.ReactNode) => (
        <div className='advanced-row'>
            <label htmlFor={`${id}-${key}`} className='subtitle-2 text-light-100'>{label}</label>
            {control}
        </div>
    )

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className='shad-dialog button max-w-[560px]'>
                <form onSubmit={submit} className='flex flex-col gap-5'>
                    <DialogHeader>
                        <DialogTitle className='h3 text-light-100'>Advanced search</DialogTitle>
                        <DialogDescription className='body-2 text-light-200'>Combine filters to narrow down your results.</DialogDescription>
                    </DialogHeader>

                    <div className='flex flex-col gap-4'>
                        {field('Name contains', 'q',
                            <input id={`${id}-q`} className='advanced-control' value={form.q} placeholder='Part of the file or folder name'
                                onChange={(e) => set('q', e.target.value)} autoFocus />)}
                        {field('Type', 'type',
                            <select id={`${id}-type`} className='advanced-control' value={form.types[0] ?? ''}
                                onChange={(e) => set('types', e.target.value ? [e.target.value as SearchFilters['types'][0]] : [])}>
                                <option value=''>Any</option>
                                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>)}
                        {field('Owner', 'owner',
                            <select id={`${id}-owner`} className='advanced-control' value={form.owner}
                                onChange={(e) => set('owner', e.target.value as SearchFilters['owner'])}>
                                {OWNER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>)}
                        {field('Location', 'location',
                            <select id={`${id}-location`} className='advanced-control' value={form.location}
                                onChange={(e) => set('location', e.target.value as SearchFilters['location'])}>
                                {LOCATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>)}
                        {field('Date modified', 'modified',
                            <select id={`${id}-modified`} className='advanced-control' value={form.modified ?? ''}
                                onChange={(e) => set('modified', (e.target.value || null) as SearchFilters['modified'])}>
                                <option value=''>Any time</option>
                                {MODIFIED_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                <option value='custom'>Custom range…</option>
                            </select>)}
                        {form.modified === 'custom' && (
                            <div className='advanced-row'>
                                <span className='subtitle-2 text-light-100'>Between</span>
                                <div className='flex items-center gap-2'>
                                    <input type='date' aria-label='From' className='advanced-control' value={form.from ?? ''} max={form.to ?? undefined}
                                        onChange={(e) => set('from', e.target.value || null)} />
                                    <span className='text-light-200'>–</span>
                                    <input type='date' aria-label='To' className='advanced-control' value={form.to ?? ''} min={form.from ?? undefined}
                                        onChange={(e) => set('to', e.target.value || null)} />
                                </div>
                            </div>
                        )}
                        {customInvalid && <p className='caption text-error' role='alert'>Pick at least one date for a custom range.</p>}
                    </div>

                    <DialogFooter className='flex flex-row justify-end gap-3'>
                        <button type='button' className='search-text-btn' onClick={() => setForm(EMPTY_FILTERS)}>Reset</button>
                        <button type='submit' className='primary-pill-btn' disabled={customInvalid}>Search</button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

export default AdvancedSearch
