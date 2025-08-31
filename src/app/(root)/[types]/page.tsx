import { SearchParams } from 'next/dist/server/request/search-params'
import React from 'react'
import { fileDocument, FileType, SearchParamProps } from '../../../../types'
import Sort from '@/components/Sort'
import { getFiles } from '@/lib/appwrite/actions/file.action'
import { Models } from 'node-appwrite'
import Card from '@/components/Card'
import { getFileTypesParams } from '@/lib/utils'

const page = async ({ params, searchParams }: SearchParamProps) => {


    const type = ((await params)?.types as string) || ""
    const searchText = ((await searchParams)?.query as string) || ""




    const sort = ((await searchParams)?.sort as string) || ""
    const types = getFileTypesParams(type) as FileType[]

    const files = await getFiles({ types, searchText, sort })

    return (
        <div className='page-container'>
            <section className='w-full'>
                <h1 className='h1 capitalize'>{type}</h1>

                <div className='total-size-section'>
                    <p className='body-1'>
                        Total : <span>O MB</span>
                    </p>
                    <div className='sort-container'>
                        <p className='body-1 hidden sm:block text-light-200'>
                            Sort By :
                        </p>
                        <Sort />
                    </div>
                </div>
            </section>
            {files.total > 0 ? (
                <section className="file-list">
                    {
                        files.documents.map((file: fileDocument) => {
                            return <Card key={file.$id} file={file} />
                        })
                    }
                </section>
            ) : (
                <p className="empty-list">No files uploaded</p>
            )}
        </div>
    )
}

export default page