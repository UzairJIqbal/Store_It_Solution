'use client'
import React, { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from './ui/button'
import { cn, getFileType } from '@/lib/utils'
import Image from 'next/image'
import Thumbnail from './Thumbnail'
import { MAX_FILE_SIZE } from '../../constants'
import { toast } from "sonner"
import { UploadFile } from '@/lib/appwrite/actions/file.action'
import { usePathname } from 'next/navigation'
import { UploadFileProps } from "../../types/index"
interface Props {
    accountId: string,
    ownerId: string,
    className?: string
}


const FileUploader = ({ ownerId, accountId, className }: Props) => {
    const path = usePathname()
    const [files, setFiles] = useState<File[]>([]);
    const handleRemoveFile = (
        e: React.MouseEvent<HTMLImageElement, MouseEvent>,
        fileName: string
    ) => {
        e.stopPropagation()
        setFiles((prevFiles) => prevFiles.filter((file) => file.name !== fileName))
    }
    const onDrop = useCallback(
        async (acceptedFiles: File[]) => {
            setFiles(acceptedFiles);

            const uploadPromises = acceptedFiles.map(async (file) => {
                if (file.size > MAX_FILE_SIZE) {
                    setFiles((prevFiles) =>
                        prevFiles.filter((f) => f.name !== file.name),
                    );

                    return toast("File Size is too Large", {
                        description: (
                            <p className="body-2 text-white">
                                <span className="font-semibold">{file.name}</span> is too large.
                                Max file size is 50MB.
                            </p>
                        ),
                        className: "error-toast",
                    });
                }

                return UploadFile({ file, ownerId, accountId, path }).then(
                    (UploadFile) => {
                        if (UploadFile) {
                            setFiles((prevFiles) =>
                                prevFiles.filter((f) => f.name !== file.name),
                            );
                        }
                    },
                );
            });

            await Promise.all(uploadPromises);
        },
        [ownerId, accountId, path],
    );

    const { getRootProps, getInputProps } = useDropzone({ onDrop })

    return (
        <div {...getRootProps()} className="cursor-pointer">
            <input {...getInputProps()} />
            <Button
                type='submit'
                className={cn('uploader-button', className)}
            >
                <Image
                    src="/assets/icons/upload.svg"
                    alt="upload"
                    width={24}
                    height={24}
                />
                <p>Upload</p>
            </Button>
            {
                files.length > 0 && (
                    <ul className='uploader-preview-list'>
                        <h4 className='h4 text-light-100'>Uploading</h4>
                        {
                            files.map((file, index) => {
                                const { type, extension } = getFileType(file.name)
                                return (
                                    <li key={`${file.name} - ${index}`}
                                        className='uploader-preview-item'>
                                        <div className='flex items-center gap-3'>
                                            <Thumbnail
                                                type={type}
                                                extension={extension}
                                                url={URL.createObjectURL(file)}
                                            />

                                            <div className='preview-item-new'>
                                                {file.name}
                                                <Image src="/assets/icons/file-loader.gif"
                                                    alt='loader'
                                                    width={80}
                                                    height={26}
                                                />
                                            </div>
                                        </div>
                                        <Image
                                            src="/assets/icons/remove.svg"
                                            width={24}
                                            height={24}
                                            alt="Remove"
                                            onClick={(e) => handleRemoveFile(e, file.name)}
                                        />
                                    </li>
                                )
                            })
                        }
                    </ul>
                )


            }
        </div>
    )
}

export default FileUploader