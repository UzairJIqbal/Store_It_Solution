import React from 'react'
import { fileDocument } from '../../types'
import Link from 'next/link'
import Thumbnail from './Thumbnail'
import { convertFileSize } from '@/lib/utils'
import FormattedDataTime from './FormattedDataTime'
import ActionDropdown from './ActionDropdown'

const Card = ({ file }: { file: fileDocument }) => {
    return (
        <Link
            href={file.url}
            target='_blank'
            className='file-card'
        >
            <div className='flex justify-center'>
                <Thumbnail type={file.type} extension={file.extension} url={file.url} className='!size-20' imageClassName="!size-11" />
            </div>

            <div className='flex flex-col items-end justify-between'>
                <ActionDropdown file={file} />
                <p className='body-1'>{convertFileSize(file.size)}</p>
            </div>

            <div className='fill-card-details'>
                <p className='subtitle-2 line-clamp-1'>
                    {file.name}
                </p>
                <FormattedDataTime date={file.$createdAt} className='body-2 text-light-100' />
                <p className='caption line-clamp-1 text-light-200'>By : {file.ownerId.fullName} </p>
            </div>

            {file.name}
        </Link>
    )
}

export default Card