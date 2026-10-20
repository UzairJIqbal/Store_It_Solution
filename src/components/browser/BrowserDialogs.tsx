'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FolderClosed, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import FileDetails from '@/components/FileDetails'
import ShareDialog from '@/components/ShareDialog'
import { cn, formatDateTime } from '@/lib/utils'
import { BrowserItem, describeItems, sourceOf, splitFileName } from './items'
import { useBrowserActions } from './actions'
import { FolderDocument } from '../../../types'

export type DialogState =
    | { type: 'new-folder' }
    | { type: 'rename', item: BrowserItem }
    | { type: 'move', items: BrowserItem[] }
    | { type: 'shortcuts' }
    | null

export const SHORTCUTS: { group: string, keys: { combo: string[], label: string }[] }[] = [
    {
        group: 'Selection',
        keys: [
            { combo: ['↑', '↓', '←', '→'], label: 'Move between items' },
            { combo: ['Shift', 'Arrow'], label: 'Extend the selection' },
            { combo: ['Home', 'End'], label: 'Jump to the first or last item' },
            { combo: ['Space'], label: 'Select or deselect the focused item' },
            { combo: ['⌘/Ctrl', 'A'], label: 'Select all' },
            { combo: ['Esc'], label: 'Clear the selection' },
        ],
    },
    {
        group: 'Actions',
        keys: [
            { combo: ['Enter'], label: 'Open' },
            { combo: ['F2'], label: 'Rename' },
            { combo: ['M'], label: 'Move to…' },
            { combo: ['I'], label: 'Details and activity' },
            { combo: ['⌥/Alt', '⌘/Ctrl', 'S'], label: 'Add to or remove from Starred' },
            { combo: ['Delete'], label: 'Move to trash' },
        ],
    },
    {
        group: 'Create & navigate',
        keys: [
            { combo: ['N'], label: 'New folder' },
            { combo: ['U'], label: 'Upload files' },
            { combo: ['Alt', '↑'], label: 'Go up one folder' },
            { combo: ['V'], label: 'Switch list / grid view' },
            { combo: ['/'], label: 'Search' },
            { combo: ['?'], label: 'Show keyboard shortcuts' },
        ],
    },
]

type TreeFolder = Pick<FolderDocument, '$id' | 'name' | 'parentId' | 'ancestors'>

interface Props {
    dialog: DialogState,
    onClose: () => void,
    folderId: string | null,
    path: string,
    onMove: (items: BrowserItem[], targetId: string | null, targetName: string) => Promise<boolean>,
}

const SubmitButton = ({ loading, children, ...props }: React.ComponentProps<typeof Button> & { loading?: boolean }) => (
    <Button type='submit' className='modal-submit-button' disabled={loading || props.disabled} {...props}>
        <p>{children}</p>
        {loading && <Loader2 className='size-5 animate-spin' aria-hidden />}
    </Button>
)

const NameForm = ({ initial, submitLabel, onSubmit, onCancel }: {
    initial: string,
    submitLabel: string,
    onSubmit: (name: string) => Promise<boolean>,
    onCancel: () => void,
}) => {
    const [name, setName] = useState(initial)
    const [loading, setLoading] = useState(false)

    return (
        <form
            className='flex flex-col gap-6'
            onSubmit={async (e) => {
                e.preventDefault()
                if (!name.trim()) return
                setLoading(true)
                const ok = await onSubmit(name)
                setLoading(false)
                if (ok) onCancel()
            }}
        >
            <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={(e) => e.target.select()}
                maxLength={255}
                aria-label='Name'
                className='rename-input-field'
            />
            <DialogFooter className='flex flex-col gap-3 md:flex-row'>
                <Button type='button' onClick={onCancel} className='modal-cancel-button'>Cancel</Button>
                <SubmitButton loading={loading} disabled={!name.trim()}>{submitLabel}</SubmitButton>
            </DialogFooter>
        </form>
    )
}

const MovePicker = ({ items, onMove, onCancel }: {
    items: BrowserItem[],
    onMove: Props['onMove'],
    onCancel: () => void,
}) => {
    const { getFolderTree } = useBrowserActions()
    const [tree, setTree] = useState<TreeFolder[] | null>(null)
    const source = sourceOf(items[0])
    const [location, setLocation] = useState<string | null>(source)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        getFolderTree().then(setTree).catch(() => {
            toast("Couldn't load your folders", { className: 'error-toast' })
            setTree([])
        })
    }, [getFolderTree])

    // Moving folders can't enter themselves or anything below them
    const blocked = useMemo(() => {
        const moving = new Set(items.filter((i) => i.kind === 'folder').map((i) => i.id))
        return (f: TreeFolder) => moving.has(f.$id) || f.ancestors.some((a) => moving.has(a))
    }, [items])

    const current = tree?.find((f) => f.$id === location) ?? null
    const children = (tree ?? [])
        .filter((f) => (f.parentId ?? null) === location)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    const locationName = current?.name ?? 'My Files'
    const unchanged = location === source

    return (
        <div className='flex flex-col gap-4'>
            <div className='move-picker'>
                <div className='move-picker-header'>
                    {location !== null && (
                        <button
                            type='button'
                            className='uploader-tray-icon-btn'
                            onClick={() => setLocation(current?.parentId ?? null)}
                            aria-label='Back'
                        >
                            <ChevronLeft className='size-5' />
                        </button>
                    )}
                    <p className='subtitle-2 truncate'>{locationName}</p>
                </div>
                <ul className='move-picker-list' aria-label={`Folders in ${locationName}`}>
                    {tree === null && <li className='flex-center py-6'><Loader2 className='size-5 animate-spin text-brand' aria-label='Loading folders' /></li>}
                    {tree !== null && children.length === 0 && <li className='caption py-6 text-center text-light-200'>No folders here</li>}
                    {children.map((f) => {
                        const disabled = blocked(f)
                        return (
                            <li key={f.$id}>
                                <button
                                    type='button'
                                    disabled={disabled}
                                    onClick={() => setLocation(f.$id)}
                                    className='move-picker-item'
                                    title={disabled ? "A folder can't be moved into itself" : undefined}
                                >
                                    <FolderClosed className='size-5 shrink-0 fill-brand/80 text-brand' aria-hidden />
                                    <span className='body-2 flex-1 truncate text-left'>{f.name}</span>
                                    {!disabled && <ChevronRight className='size-4 text-light-200' aria-hidden />}
                                </button>
                            </li>
                        )
                    })}
                </ul>
            </div>
            <DialogFooter className='flex flex-col gap-3 md:flex-row'>
                <Button type='button' onClick={onCancel} className='modal-cancel-button'>Cancel</Button>
                <SubmitButton
                    type='button'
                    loading={loading}
                    disabled={unchanged || tree === null}
                    title={unchanged ? 'The items are already here' : undefined}
                    onClick={async () => {
                        setLoading(true)
                        const ok = await onMove(items, location, locationName)
                        setLoading(false)
                        if (ok) onCancel()
                    }}
                >
                    Move here
                </SubmitButton>
            </DialogFooter>
        </div>
    )
}

const BrowserDialogs = ({ dialog, onClose, folderId, path, onMove }: Props) => {
    const { createFolder, renameFolder, renameFile } = useBrowserActions()

    const content = () => {
        switch (dialog?.type) {
            case 'new-folder':
                return (
                    <>
                        <DialogHeader><DialogTitle className='text-center text-light-100'>New folder</DialogTitle></DialogHeader>
                        <NameForm
                            initial='Untitled folder'
                            submitLabel='Create'
                            onCancel={onClose}
                            onSubmit={async (name) => {
                                const result = await createFolder({ name, parentId: folderId, path })
                                if (!result.ok) toast(result.error, { className: 'error-toast' })
                                return result.ok
                            }}
                        />
                    </>
                )
            case 'rename': {
                const { item } = dialog
                const extension = item.file?.extension ?? ''
                return (
                    <>
                        <DialogHeader><DialogTitle className='text-center text-light-100'>Rename</DialogTitle></DialogHeader>
                        <NameForm
                            initial={item.kind === 'file' ? splitFileName(item.name, extension) : item.name}
                            submitLabel='Rename'
                            onCancel={onClose}
                            onSubmit={async (name) => {
                                if (item.kind === 'folder') {
                                    const result = await renameFolder({ folderId: item.id, name, path })
                                    if (!result.ok) toast(result.error, { className: 'error-toast' })
                                    return result.ok
                                }
                                try {
                                    await renameFile({ fileId: item.id, name: name.trim(), extension, path })
                                    return true
                                } catch {
                                    toast("Couldn't rename the file", { className: 'error-toast' })
                                    return false
                                }
                            }}
                        />
                    </>
                )
            }
            case 'move':
                return (
                    <>
                        <DialogHeader>
                            <DialogTitle className='text-center text-light-100'>Move {describeItems(dialog.items)}</DialogTitle>
                            <DialogDescription className='text-center'>Choose a destination folder</DialogDescription>
                        </DialogHeader>
                        <MovePicker items={dialog.items} onMove={onMove} onCancel={onClose} />
                    </>
                )
            case 'shortcuts':
                return (
                    <>
                        <DialogHeader><DialogTitle className='text-center text-light-100'>Keyboard shortcuts</DialogTitle></DialogHeader>
                        <div className='flex max-h-[60vh] flex-col gap-5 overflow-y-auto'>
                            {SHORTCUTS.map(({ group, keys }) => (
                                <section key={group}>
                                    <h3 className='subtitle-2 mb-2 text-brand'>{group}</h3>
                                    <dl className='flex flex-col gap-2'>
                                        {keys.map(({ combo, label }) => (
                                            <div key={label} className='flex items-center justify-between gap-4'>
                                                <dt className='body-2 text-light-100'>{label}</dt>
                                                <dd className='flex shrink-0 gap-1'>
                                                    {combo.map((k) => <kbd key={k} className='kbd'>{k}</kbd>)}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                </section>
                            ))}
                        </div>
                    </>
                )
            default:
                return null
        }
    }

    return (
        <Dialog open={dialog !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={cn('shad-dialog button', dialog?.type === 'shortcuts' && 'max-w-[480px]')}>
                {content()}
            </DialogContent>
        </Dialog>
    )
}

export default BrowserDialogs
