'use client'
// Type, Modified and Sharing chips above a folder's contents. They filter what's already loaded, so they apply instantly.
import React from 'react'
import {
    DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { Chip } from '@/components/search/SearchFilterBar'
import { ModifiedPreset, MODIFIED_OPTIONS, modifiedLabel, modifiedRange, SearchType, TYPE_OPTIONS, typeLabel } from '@/lib/search'
import { BrowserItem } from './items'

export type SharingFilter = 'any' | 'shared' | 'private'

export interface FolderFilterState {
    types: SearchType[],
    modified: Exclude<ModifiedPreset, 'custom'> | null,
    sharing: SharingFilter,
}

export const NO_FOLDER_FILTERS: FolderFilterState = { types: [], modified: null, sharing: 'any' }

const SHARING_OPTIONS: { value: Exclude<SharingFilter, 'any'>, label: string }[] = [
    { value: 'shared', label: 'Shared' },
    { value: 'private', label: 'Not shared' },
]

export const hasFolderFilters = (f: FolderFilterState) => f.types.length > 0 || f.modified !== null || f.sharing !== 'any'

export const filterItems = (items: BrowserItem[], f: FolderFilterState) => {
    if (!hasFolderFilters(f)) return items
    const [from, to] = modifiedRange({ modified: f.modified, from: null, to: null })
    return items.filter((item) => {
        if (f.types.length > 0 && !f.types.includes(item.kind === 'folder' ? 'folder' : item.file!.type as SearchType)) return false
        if (from && item.modified < from) return false
        if (to && item.modified >= to) return false
        // Only files can be shared, so folders never match the Shared filter
        if (f.sharing === 'shared' && !item.file?.isShared) return false
        if (f.sharing === 'private' && item.file?.isShared) return false
        return true
    })
}

const FolderFilters = ({ filters, onChange }: { filters: FolderFilterState, onChange: (f: FolderFilterState) => void }) => {
    const apply = (change: Partial<FolderFilterState>) => onChange({ ...filters, ...change })
    const toggleType = (value: SearchType) =>
        apply({ types: filters.types.includes(value) ? filters.types.filter((t) => t !== value) : [...filters.types, value] })

    return (
        <div role='toolbar' aria-label='Filters' className='flex flex-wrap items-center gap-2'>
            <Chip label={typeLabel(filters.types)} applied={filters.types.length > 0} onClear={() => apply({ types: [] })}>
                {TYPE_OPTIONS.map((o) => (
                    <DropdownMenuCheckboxItem key={o.value} checked={filters.types.includes(o.value)}
                        onSelect={(e) => { e.preventDefault(); toggleType(o.value) }}>
                        {o.label}
                    </DropdownMenuCheckboxItem>
                ))}
            </Chip>

            <Chip label={modifiedLabel({ modified: filters.modified, from: null, to: null })} applied={filters.modified !== null}
                onClear={() => apply({ modified: null })}>
                <DropdownMenuRadioGroup value={filters.modified ?? ''}
                    onValueChange={(v) => apply({ modified: v as FolderFilterState['modified'] })}>
                    {MODIFIED_OPTIONS.map((o) => <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
            </Chip>

            <Chip label={SHARING_OPTIONS.find((o) => o.value === filters.sharing)?.label ?? 'Sharing'}
                applied={filters.sharing !== 'any'} onClear={() => apply({ sharing: 'any' })}>
                <DropdownMenuRadioGroup value={filters.sharing} onValueChange={(v) => apply({ sharing: v as SharingFilter })}>
                    {SHARING_OPTIONS.map((o) => <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
            </Chip>

            {hasFolderFilters(filters) && (
                <button type='button' className='body-2 rounded-full px-3 py-1.5 font-medium text-brand-100 hover:bg-brand/10 focus-visible:ring-2 focus-visible:ring-brand'
                    onClick={() => onChange(NO_FOLDER_FILTERS)}>
                    Clear filters
                </button>
            )}
        </div>
    )
}

export default FolderFilters
