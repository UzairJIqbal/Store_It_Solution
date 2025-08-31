import React from 'react'
import { fileDocument } from '../../types'
import Thumbnail from './Thumbnail'
import FormattedDataTime from './FormattedDataTime'
import { convertFileSize, formatDateTime } from '@/lib/utils'
import { Input } from './ui/input'
import { Button } from './ui/button'
import Image from 'next/image'

interface props {
    file: fileDocument,
    onRemove: (email: string) => void
    onInputChange: React.Dispatch<React.SetStateAction<string[]>>
}

const Imagethumbnail = ({ file }: { file: fileDocument }) => {
    return <div className='file-details-thumbnail'>
        <Thumbnail type={file.type} extension={file.extension} url={file.url} />
        <div className='flex flex-col'>
            <p className='subtitle-2 mb-1'>{file.name}</p>
            <FormattedDataTime date={file.$createdAt} className="caption" />
        </div>
    </div>
}

const DetialLow = ({ label, value }: { label: string, value: string }) => {
    return (
        <div className="flex">
            <p className="file-details-label">{label}</p>
            <p className="file-details-value">{value}</p>
        </div>
    )

}
const FileDetails = ({ file }: { file: fileDocument }) => {
    return (
        <>
            <Imagethumbnail file={file} />
            <div className='space-x-1fdf'>

                <DetialLow label='Format' value={file.extension} />

                <DetialLow label='Date' value={formatDateTime(file.$createdAt)} />

                <DetialLow label='Owner' value={file.ownerId.fullName} />

                <DetialLow label='Size' value={convertFileSize(file.size)} />

                <DetialLow label='Updated' value={formatDateTime(file.$updatedAt)} />

            </div>


        </>
    )
}

export const ShareInput = ({ file, onRemove, onInputChange }: props) => {
    return (
        <>
            <Imagethumbnail file={file} />
            <div className='share-wrapper'>
                <p className="subtitle-2 pl-1 text-light-100">
                    Share file with other users
                </p>
                <Input
                    type='email'
                    placeholder='Enter your email address'
                    onChange={(e) => onInputChange(e.target.value.trim().split(","))}
                    className="share-input-field"
                />
            </div>

            <div className="pt-4">
                <div className="flex justify-between">
                    <p className="subtitle-2 text-light-200">
                        Shared with
                    </p>
                    <p className='subtitle-2 text-light-100'>
                        {file.users.length} Users
                    </p>
                </div>
            </div>

            <ul className="pt-2">
                {
                    file.users.map((email: string) => {
                        return <>
                            <li key={email}
                                className="flex items-center justify-between gap-2"
                            >
                                <p className="subtitle-2">
                                    {email}
                                </p>
                                <Button
                                    onClick={() => onRemove(email)}
                                    className="share-remove-user"

                                >
                                    <Image
                                        src="/assets/icons/remove.svg"
                                        alt="Remove"
                                        width={24}
                                        height={24}
                                        className="remove-icon"
                                    />
                                </Button>
                            </li>
                        </>
                    })
                }
            </ul>
        </>
    )
}

export default FileDetails
