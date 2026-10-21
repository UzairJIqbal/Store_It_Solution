'use client'
import React, { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Download, Eye, History, Info, Loader2, MoreVertical, Pencil, Star, Trash2, UserPlus } from 'lucide-react'
import { fileDocument } from '../../types'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn, fileDownloadUrl } from '@/lib/utils'
import { Input } from './ui/input'
import { renameFile } from '@/lib/appwrite/actions/file.action'
import { restoreItems, toggleStar, trashItems } from '@/lib/appwrite/actions/lifecycle.action'
import { useLifecycle } from './lifecycle/LifecycleProvider'
import { errorToast, undoToast } from '@/lib/undo'

// Moves one file to the trash and offers Undo; shared by the card menu, the viewer and the Storage page
export const trashFileWithUndo = async (file: fileDocument, path: string, refresh: () => void) => {
    const result = await trashItems({ fileIds: [file.$id], path })
    if (!result.ok) return errorToast(result.error)
    undoToast(`"${file.name}" moved to trash`, async () => {
        const undo = await restoreItems({ fileIds: [file.$id], path })
        if (!undo.ok) errorToast(undo.error)
        else toast('Restored from trash')
        refresh()
    })
    refresh()
}

// Stars or unstars one file; Undo flips it back
export const starFileWithUndo = async (file: fileDocument, starred: boolean, path: string, refresh: () => void) => {
    const result = await toggleStar({ fileId: file.$id, starred, path })
    if (!result.ok) return errorToast(result.error)
    undoToast(starred ? `"${file.name}" added to Starred` : `"${file.name}" removed from Starred`, async () => {
        const undo = await toggleStar({ fileId: file.$id, starred: !starred, path })
        if (!undo.ok) errorToast(undo.error)
        refresh()
    })
    refresh()
}

const ActionDropdown = ({ file, className, files, index }: {
    file: fileDocument,
    className?: string,
    // The list the file is shown in, so Open can step through it
    files?: fileDocument[],
    index?: number,
}) => {
    const [renaming, setRenaming] = useState(false)
    const [name, setName] = useState(file.name.replace(new RegExp(`\\.${file.extension}$`), ''))
    const [isloading, setIsloading] = useState(false)
    const path = usePathname()
    const router = useRouter()
    const { openPreview, openDetails, openVersions, openShare } = useLifecycle()
    // The server checks again; this only hides what would be refused
    const role = file.role ?? 'owner'
    const canEdit = role === 'owner' || role === 'editor'

    const rename = async () => {
        setIsloading(true)
        try {
            await renameFile({ fileId: file.$id, name, extension: file.extension, path })
            setRenaming(false)
        } catch {
            errorToast("Couldn't rename the file")
        } finally {
            setIsloading(false)
        }
    }

    const star = () => starFileWithUndo(file, !file.isStarred, path, router.refresh)

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger className={cn("item-more-btn size-10", className)} onClick={(e) => e.stopPropagation()} aria-label={`More actions for ${file.name}`}>
                    <MoreVertical className='size-5' aria-hidden />
                </DropdownMenuTrigger>

                <DropdownMenuContent onClick={(e) => e.stopPropagation()} className='browser-menu'>
                    <DropdownMenuLabel className="max-w-[220px] truncate">{file.name}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => openPreview(files ?? [file], files ? index ?? 0 : 0)}><Eye />Open</DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <a href={fileDownloadUrl(file.$id)} download={file.name}><Download />Download</a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {canEdit && <DropdownMenuItem onSelect={() => setRenaming(true)}><Pencil />Rename</DropdownMenuItem>}
                    {canEdit && <DropdownMenuItem onSelect={() => openShare(file)}><UserPlus />Share</DropdownMenuItem>}
                    <DropdownMenuItem onSelect={star}>
                        <Star className={cn(file.isStarred && 'fill-current')} />{file.isStarred ? 'Remove from Starred' : 'Add to Starred'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openDetails({ kind: 'file', file })}><Info />Details</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openVersions(file)}><History />Manage versions</DropdownMenuItem>
                    {role === 'owner' && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className='browser-menu-danger' onSelect={() => trashFileWithUndo(file, path, router.refresh)}>
                                <Trash2 />Move to trash
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={renaming} onOpenChange={setRenaming}>
                <DialogContent className="shad-dialog button" onClick={(e) => e.stopPropagation()}>
                    <DialogHeader className="flex flex-col gap-3">
                        <DialogTitle className="text-center text-light-100">Rename</DialogTitle>
                        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label='Name' autoFocus />
                    </DialogHeader>
                    <DialogFooter className="flex flex-col gap-3 md:flex-row">
                        <Button onClick={() => setRenaming(false)} className="modal-cancel-button">Cancel</Button>
                        <Button onClick={rename} className="modal-submit-button" disabled={isloading || !name.trim()}>
                            <p>Rename</p>
                            {isloading && <Loader2 className='size-5 animate-spin' aria-hidden />}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

export default ActionDropdown
