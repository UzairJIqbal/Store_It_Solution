'use client'
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { fileDocument } from '../../../types'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import FileDetails, { DetailsTarget } from '@/components/FileDetails'
import ShareDialog from '@/components/ShareDialog'
import FilePreview from './FilePreview'
import ManageVersions from './ManageVersions'

interface LifecycleApi {
    // Opens the viewer on files[index]; ← and → move through the rest of the list
    openPreview: (files: fileDocument[], index?: number) => void,
    openDetails: (target: DetailsTarget, tab?: 'details' | 'activity') => void,
    openVersions: (file: fileDocument) => void,
    openShare: (file: fileDocument) => void,
}

const LifecycleContext = createContext<LifecycleApi | null>(null)

export const useLifecycle = () => {
    const api = useContext(LifecycleContext)
    if (!api) throw new Error('useLifecycle needs a LifecycleProvider')
    return api
}

type Modal = { type: 'versions' | 'share', file: fileDocument } | null

const LifecycleProvider = ({ children }: { children: React.ReactNode }) => {
    const router = useRouter()
    const path = usePathname()
    const [preview, setPreview] = useState<{ files: fileDocument[], index: number } | null>(null)
    const [details, setDetails] = useState<{ target: DetailsTarget, tab: 'details' | 'activity' } | null>(null)
    const [modal, setModal] = useState<Modal>(null)

    const openPreview = useCallback((files: fileDocument[], index = 0) => {
        if (files.length) setPreview({ files, index: Math.min(Math.max(index, 0), files.length - 1) })
    }, [])
    const openDetails = useCallback((target: DetailsTarget, tab: 'details' | 'activity' = 'details') => setDetails({ target, tab }), [])
    const openVersions = useCallback((file: fileDocument) => setModal({ type: 'versions', file }), [])
    const openShare = useCallback((file: fileDocument) => setModal({ type: 'share', file }), [])
    const api = useMemo(() => ({ openPreview, openDetails, openVersions, openShare }), [openPreview, openDetails, openVersions, openShare])

    const closeModal = useCallback(() => setModal(null), [])

    return (
        <LifecycleContext.Provider value={api}>
            {children}

            {preview && (
                <FilePreview
                    files={preview.files}
                    index={preview.index}
                    onIndexChange={(index) => setPreview((p) => p && { ...p, index })}
                    onClose={() => {
                        setPreview(null)
                        // Opened times and stars changed while the viewer was up
                        router.refresh()
                    }}
                    onShare={openShare}
                    onStarChange={(file, starred) => setPreview((p) => p && {
                        ...p,
                        files: p.files.map((f) => (f.$id === file.$id ? { ...f, isStarred: starred } : f)),
                    })}
                />
            )}

            <Sheet open={details !== null} onOpenChange={(open) => !open && setDetails(null)}>
                <SheetContent side='right' className='details-sheet'>
                    <SheetTitle className='sr-only'>Details</SheetTitle>
                    <SheetDescription className='sr-only'>Details and activity of the selected item</SheetDescription>
                    {details && (
                        <FileDetails
                            key={details.target.kind === 'file' ? details.target.file.$id : details.target.folder.$id}
                            target={details.target}
                            initialTab={details.tab}
                            className='h-full pt-6'
                        />
                    )}
                </SheetContent>
            </Sheet>

            <Dialog open={modal !== null} onOpenChange={(open) => !open && closeModal()}>
                <DialogContent className='shad-dialog button max-w-[480px]'>
                    {modal?.type === 'versions' && <ManageVersions file={modal.file} onClose={closeModal} />}
                    {modal?.type === 'share' && <ShareDialog file={modal.file} path={path} onDone={closeModal} />}
                </DialogContent>
            </Dialog>
        </LifecycleContext.Provider>
    )
}

export default LifecycleProvider
