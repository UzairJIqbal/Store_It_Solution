'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Choice = 'keep' | 'replace'

interface Props {
    names: string[],
    folderName: string,
    onResolve: (choice: Choice | 'skip') => void,
}

const options: { value: Choice, label: string, hint: string }[] = [
    { value: 'keep', label: 'Keep both', hint: 'The new file gets a number, like "report (1).pdf"' },
    { value: 'replace', label: 'Replace', hint: 'The existing file gets the new contents and keeps its sharing' },
]

// Shown while files without a clash keep uploading
const ClashDialog = ({ names, folderName, onResolve }: Props) => {
    const [choice, setChoice] = useState<Choice>('keep')
    const single = names.length === 1

    return (
        <Dialog open onOpenChange={(open) => !open && onResolve('skip')}>
            <DialogContent className='shad-dialog button'>
                <DialogHeader>
                    <DialogTitle className='text-center text-light-100'>
                        {single ? 'File already exists' : `${names.length} files already exist`}
                    </DialogTitle>
                    <DialogDescription className='text-center'>
                        {single
                            ? <><span className='font-semibold text-light-100'>{names[0]}</span> is already in {folderName}.</>
                            : <>These names are already used in {folderName}: {names.slice(0, 3).join(', ')}{names.length > 3 && ` and ${names.length - 3} more`}.</>}
                    </DialogDescription>
                </DialogHeader>

                <div role='radiogroup' aria-label='What to do' className='flex flex-col gap-2'>
                    {options.map((o) => (
                        <label
                            key={o.value}
                            className={cn(
                                'flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors',
                                choice === o.value ? 'border-brand bg-brand/5' : 'border-light-300 hover:bg-light-400',
                            )}
                        >
                            <input
                                type='radio'
                                name='clash-choice'
                                value={o.value}
                                checked={choice === o.value}
                                onChange={() => setChoice(o.value)}
                                className='mt-1 accent-brand'
                            />
                            <span>
                                <span className='subtitle-2 block text-light-100'>{o.label}</span>
                                <span className='caption text-light-200'>{o.hint}</span>
                            </span>
                        </label>
                    ))}
                </div>

                <DialogFooter className='flex flex-col gap-3 md:flex-row'>
                    <Button type='button' className='modal-cancel-button' onClick={() => onResolve('skip')}>
                        {single ? 'Skip' : 'Skip these'}
                    </Button>
                    <Button type='button' className='modal-submit-button' onClick={() => onResolve(choice)}>
                        Upload
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default ClashDialog
