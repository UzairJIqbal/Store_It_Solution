import React from 'react'
import { Star } from 'lucide-react'
import { fileDocument } from '../../types'
import Thumbnail from './Thumbnail'
import { convertFileSize } from '@/lib/utils'
import FormattedDataTime from './FormattedDataTime'
import ActionDropdown from './ActionDropdown'
import OpenFile from './lifecycle/OpenFile'

// A click opens the viewer; ← and → then move through the other cards of the same list
const Card = ({ file, files, index }: { file: fileDocument, files?: fileDocument[], index?: number }) => {
    const list = files ?? [file]
    const position = files ? index ?? 0 : 0
    return (
        <OpenFile files={list} index={position} className='file-card cursor-pointer'>
            <div className='flex justify-center'>
                <Thumbnail type={file.type} extension={file.extension} url={file.url} className='!size-20' imageClassName="!size-11" />
            </div>

            <div className='flex flex-col items-end justify-between'>
                <ActionDropdown file={file} files={list} index={position} />
                <p className='body-1'>{convertFileSize(file.size)}</p>
            </div>

            <div className='fill-card-details'>
                <p className='subtitle-2 flex items-center gap-1'>
                    <span className='line-clamp-1'>{file.name}</span>
                    {file.isStarred && <Star className='size-4 shrink-0 fill-current text-brand' aria-label='Starred' />}
                </p>
                <FormattedDataTime date={file.$createdAt} className='body-2 text-light-100' />
                <p className='caption line-clamp-1 text-light-200'>By : {file.ownerId?.fullName ?? 'me'} </p>
            </div>
        </OpenFile>
    )
}

export default Card
