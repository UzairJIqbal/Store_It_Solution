import { fileDocument, FolderDocument } from '../../../types'

export type ItemKind = 'folder' | 'file'

// Folders and files share one selection model; `key` is unique across both kinds
export interface BrowserItem {
    key: string,
    kind: ItemKind,
    id: string,
    name: string,
    modified: string,
    size: number | null,
    folder?: FolderDocument,
    file?: fileDocument,
}

export type ViewMode = 'list' | 'grid'
export type SortField = 'name' | 'modified' | 'size'
export type SortDirection = 'asc' | 'desc'

export interface SortState {
    field: SortField,
    direction: SortDirection,
    foldersFirst: boolean,
}

export const DEFAULT_SORT: SortState = { field: 'name', direction: 'asc', foldersFirst: true }

export const ITEM_DRAG_TYPE = 'application/x-storeit-items'

export const itemKey = (kind: ItemKind, id: string) => `${kind}:${id}`

export const toItems = (folders: FolderDocument[], files: fileDocument[]): BrowserItem[] => [
    ...folders.map((folder) => ({
        key: itemKey('folder', folder.$id),
        kind: 'folder' as const,
        id: folder.$id,
        name: folder.name,
        modified: folder.$updatedAt,
        size: null,
        folder,
    })),
    ...files.map((file) => ({
        key: itemKey('file', file.$id),
        kind: 'file' as const,
        id: file.$id,
        name: file.name,
        modified: file.$updatedAt,
        size: file.size,
        file,
    })),
]

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export const sortItems = (items: BrowserItem[], sort: SortState) => {
    const sign = sort.direction === 'asc' ? 1 : -1
    const compare = (a: BrowserItem, b: BrowserItem) => {
        if (sort.foldersFirst && a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
        let result = 0
        if (sort.field === 'modified') result = new Date(a.modified).getTime() - new Date(b.modified).getTime()
        if (sort.field === 'size') result = (a.size ?? -1) - (b.size ?? -1)
        // Name breaks ties so the order is stable between renders
        return sign * (result || collator.compare(a.name, b.name))
    }
    return [...items].sort(compare)
}

// The folder an item currently lives in (null for the root)
export const sourceOf = (item: BrowserItem) =>
    item.kind === 'folder' ? item.folder!.parentId ?? null : item.file!.folderId ?? null

export const describeItems = (items: BrowserItem[]) =>
    items.length === 1 ? `"${items[0].name}"` : `${items.length} items`

// Splits a file name into its editable base and its extension, matching renameFile's contract
export const splitFileName = (name: string, extension: string) =>
    extension && name.toLowerCase().endsWith(`.${extension.toLowerCase()}`)
        ? name.slice(0, -(extension.length + 1))
        : name
