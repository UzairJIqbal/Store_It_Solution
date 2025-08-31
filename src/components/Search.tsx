'use client'
import Image from 'next/image'
import React, { useEffect, useState } from 'react'
import { Input } from './ui/input'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { getFiles } from '@/lib/appwrite/actions/file.action'
import { fileDocument } from '../../types'
import Thumbnail from './Thumbnail'
import FormattedDataTime from './FormattedDataTime'
import { useDebounce } from 'use-debounce'

const Search = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<fileDocument[]>([]);
    const [open, setOpen] = useState(false)

    const router = useRouter()
    const [debounceQuery] = useDebounce(query, 300)
    const searchParams = useSearchParams()
    const path = usePathname()
    const searchQuery = searchParams.get("query")

    useEffect(() => {
        const fetchFiles = async () => {
            if (debounceQuery.length === 0) {
                setResults([])
                setOpen(false)
                return router.push(path.replace(searchParams.toString(), ""))
            }
            const files = await getFiles({
                searchText: debounceQuery
            })
            setResults(files.documents)
            setOpen(true)
        }
        fetchFiles()
    }, [debounceQuery])


    useEffect(() => {
        if (!searchQuery) {
            setQuery('')
        }
    }, [searchQuery])

    const handleClick = async (file: fileDocument) => {
        setOpen(false)
        setResults([])
        router.push(`/${file.type === 'video' || file.type === 'audio' ? 'media' : file.type + 's'}?query=${query}`)
    }

    return (
        <div className='search'>
            <div className='search-input-wrapper'>
                <Image
                    src="/assets/icons/search.svg"
                    alt="Search"
                    width={24}
                    height={24}
                />
                <Input
                    value={query}
                    placeholder='Search...'
                    className='search-input'
                    onChange={(e) => setQuery(e.target.value)}
                />
                {
                    open && <ul className='search-results'>
                        {
                            results.length > 0 ? (
                                <ul>
                                    {results.map((file) => (
                                        <li key={file.$id}
                                            onClick={() => handleClick(file)}
                                        >
                                            <div className="flex cursor-pointer items-center gap-4">
                                                <Thumbnail
                                                    type={file.type}
                                                    extension={file.extension}
                                                    url={file.url}
                                                    className="size-9 min-w-9"
                                                />
                                                <p className="subtitle-2 line-clamp-1 text-light-100">
                                                    {file.name}
                                                </p>
                                            </div>
                                            <FormattedDataTime
                                                date={file.$createdAt}
                                                className="caption line-clamp-1 text-light-200"
                                            />
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="empty-result">No files found</p>
                            )
                        }

                    </ul>
                }
            </div>
        </div>
    )
}

export default Search