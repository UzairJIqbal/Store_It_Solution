'use client'
import React, { useState } from 'react'
import { ActionType, fileDocument } from '../../types'
import { Button } from './ui/button'
import { DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import {
    Dialog,
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSubContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Image from 'next/image'
import { actionsDropdownItems } from '../../constants'

import { constructDownloadUrl } from '@/lib/utils'
import Link from 'next/link'
import { Input } from './ui/input'
import { rename } from 'fs'
import { deleteFileUsers, renameFile, updateFileUsers } from '@/lib/appwrite/actions/file.action'
import { usePathname } from 'next/navigation'
import { boolean, keyof } from 'zod'
import FileDetails, { ShareInput } from './FileDetails'

const ActionDropdown = ({ file, className }: { file: fileDocument, className?: string }) => {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const [action, setAction] = useState<ActionType | null>(null)
    const [name, setName] = useState(file.name)
    const [isloading, setIsloading] = useState(false)
    const [emails, setEmails] = useState<string[]>([])
    const path = usePathname()




    const renderDialogConetent = () => {

        const closeAllModels = () => {
            setIsModalOpen(false)
            setIsDropdownOpen(false)
            setAction(null)
            setName(file.name)
        }

        const handleAction = async () => {
            if (!action) {
                return false
            }
            setIsloading(true)
            let success = false
            const actions = {
                rename: () => {
                    return renameFile({ fileId: file.$id, name, extension: file.extension, path })
                },
                share: () => {
                    return updateFileUsers({ fileId: file.$id, emails, path });

                },
                delete: () => {
                    return deleteFileUsers({
                        fileId: file.$id,
                        bucketFileId: file.bucketField,
                        path
                    });

                }
            }

            success = await actions[action.value as keyof typeof actions]()
            if (success) {
                closeAllModels()
                setIsloading(false)
            }
        }

        const handleRemove = async (email: string) => {
            const UpdatedEmails = emails.filter((e) => e !== email)
            const success = await updateFileUsers({
                fileId: file.$id,
                emails,
                path
            })

            if (success) {
                setEmails(UpdatedEmails)
            }
            closeAllModels()



        }

        if (!action) {
            return null
        }
        const { value, label } = action
        return (
            <DialogContent className="shad-dialog button">
                <DialogHeader className="flex flex-col gap-3">
                    <DialogTitle className="text-center text-light-100">{label}</DialogTitle>

                    {value === "rename" && (
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    )}
                    {
                        value === "details" && <FileDetails file={file} />
                    },
                    {value === "share" && (
                        <ShareInput
                            file={file}
                            onInputChange={setEmails}
                            onRemove={handleRemove}
                        />
                    )},
                    {
                        value === "delete" && (
                            <p className='delete-confirmation'>
                                Are you shure you want to delete <span className='delete-file-name'>{file.name}</span>?
                            </p>
                        )
                    }

                </DialogHeader>

                {['rename', 'download', 'share', 'delete'].includes(value) && (
                    <DialogFooter className="flex flex-col gap-3 md:flex-row">
                        <Button onClick={closeAllModels} className="modal-cancel-button">
                            close
                        </Button>

                        <Button onClick={handleAction} className="modal-submit-button">
                            <p className="capitalize">{value}</p>
                            {isloading && (
                                <Image
                                    src="/assets/icons/loader.svg"
                                    alt="loader"
                                    width={24}
                                    height={24}
                                    className="animate-spin"
                                />
                            )}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>

        )
    }



    return (
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen} >
            <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                <DropdownMenuTrigger className="shad-no-focus" >
                    <Image
                        src="/assets/icons/dots.svg"
                        alt="dots"
                        width={34}
                        height={34}
                    /></DropdownMenuTrigger>

                <DropdownMenuContent >
                    <DropdownMenuLabel className="max-w-[200px] truncate">{file.name}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {
                        actionsDropdownItems.map((actionItem) => {
                            return <DropdownMenuItem
                                key={actionItem.value}
                                className='shad-dropdown-item'
                                onClick={() => {
                                    setAction(actionItem)

                                    if (["rename", "share", "delete", "details", "others"].includes(actionItem.value)) {
                                        setIsModalOpen(true)
                                    }
                                }}
                            >
                                {actionItem.value === "download" ? <Link
                                    href={constructDownloadUrl(file.bucketField)}
                                    download={file.name}
                                    className='flex items-center gap-2'
                                >
                                    <Image
                                        src={actionItem.icon}
                                        alt={actionItem.label}
                                        width={30}
                                        height={30}
                                    />
                                    {actionItem.label}
                                </Link> : <div className='flex items-center gap-2'>
                                    <Image
                                        src={actionItem.icon}
                                        alt={actionItem.label}
                                        width={30}
                                        height={30}
                                    />

                                    {actionItem.label}
                                </div>}

                            </DropdownMenuItem>
                        })
                    }
                </DropdownMenuContent>
            </DropdownMenu>
            {renderDialogConetent()}
        </Dialog>
    )
}

export default ActionDropdown