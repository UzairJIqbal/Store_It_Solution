'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2, ScanSearch, Sparkles } from 'lucide-react'
import { fileDocument } from '../../../types'
import { analyzeFile, needsBytes } from '@/lib/smart/analyze'
import { saveSmartInfo } from '@/lib/appwrite/actions/smart.action'
import { searchHref } from '@/lib/search'
import { errorToast } from '@/lib/undo'

// Tag chips that search for files with the same tag. Files from before smart tags can be scanned on demand.
const SmartTags = ({ file }: { file: fileDocument }) => {
    const router = useRouter()
    const path = usePathname()
    const [tags, setTags] = useState<string[] | null>(file.tags ?? null)
    const [scanning, setScanning] = useState(false)
    const role = file.role ?? 'owner'
    const canEdit = (role === 'owner' || role === 'editor') && !file.trashedAt

    const scan = async () => {
        setScanning(true)
        try {
            let source = new File([], file.name)
            if (needsBytes(file.name)) {
                const response = await fetch(file.url)
                if (!response.ok) throw new Error("Couldn't read the file")
                source = new File([await response.blob()], file.name, { type: response.headers.get('content-type') ?? '' })
            }
            const result = await saveSmartInfo({ fileId: file.$id, smart: await analyzeFile(source), path })
            if (!result.ok) return errorToast(result.error)
            setTags(result.data!.tags)
            router.refresh()
        } catch (error) {
            errorToast(error instanceof Error ? error.message : "Couldn't scan the file")
        } finally {
            setScanning(false)
        }
    }

    return (
        <section className='smart-tags' aria-label='Smart tags'>
            <div className='flex items-center justify-between gap-2'>
                <h3 className='subtitle-2 flex items-center gap-1.5 text-light-100'>
                    <Sparkles className='size-4 text-ember' aria-hidden />Smart tags
                </h3>
                {canEdit && (
                    <button type='button' className='smart-scan-btn' onClick={scan} disabled={scanning}>
                        {scanning ? <Loader2 className='size-3.5 animate-spin' aria-hidden /> : <ScanSearch className='size-3.5' aria-hidden />}
                        {tags ? 'Re-scan' : 'Scan file'}
                    </button>
                )}
            </div>
            {tags && tags.length > 0 ? (
                <ul className='flex flex-wrap gap-1.5'>
                    {tags.map((tag) => (
                        <li key={tag}>
                            <Link href={searchHref({ q: tag })} className='smart-tag'>#{tag}</Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className='caption text-light-200'>
                    {tags ? 'No tags for this file.' : 'Not scanned yet. Scanning reads the file in your browser and saves tags like “screenshot” or “invoice”.'}
                </p>
            )}
        </section>
    )
}

export default SmartTags
