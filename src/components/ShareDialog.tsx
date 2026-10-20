'use client'
import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Globe, Link2, Loader2, Lock, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
    FileSharing, getFileSharing, getShareSuggestions, removeShare, setLinkAccess, shareFile, SharingPerson,
    transferOwnership, updateShareRole,
} from '@/lib/appwrite/actions/file.action'
import { LinkAccess, ShareRole } from '../../types'

const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const ROLE_LABEL = { viewer: 'Viewer', editor: 'Editor', owner: 'Owner' } as const

const Avatar = ({ person }: { person: Pick<SharingPerson, 'name' | 'email' | 'avatar'> }) => (
    person.avatar
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={person.avatar} alt='' className='size-9 shrink-0 rounded-full object-cover' />
        : <span className='flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold uppercase text-brand'>
            {(person.name || person.email).slice(0, 1)}
        </span>
)

const RoleMenu = ({ value, onChange, disabled, children }: {
    value: ShareRole,
    onChange: (role: ShareRole) => void,
    disabled?: boolean,
    children?: React.ReactNode,
}) => (
    <DropdownMenu modal={false}>
        <DropdownMenuTrigger disabled={disabled} className='flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-sm text-light-100 hover:bg-light-300 disabled:opacity-60'>
            {ROLE_LABEL[value]} <ChevronDown className='size-4' aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='min-w-[180px]'>
            {(['viewer', 'editor'] as ShareRole[]).map((role) => (
                <DropdownMenuItem key={role} className='shad-dropdown-item gap-2' onSelect={() => onChange(role)}>
                    <Check className={cn('size-4', role !== value && 'invisible')} aria-hidden />
                    {ROLE_LABEL[role]}
                </DropdownMenuItem>
            ))}
            {children}
        </DropdownMenuContent>
    </DropdownMenu>
)

interface Props {
    file: { $id: string, name: string },
    path: string,
    onDone: () => void,
}

// Share dialog body: add people (chips, role, notify), people with access, general access, copy link.
// Every change goes to a server action that checks the caller's role again; the UI only hides what won't be allowed.
const ShareDialog = ({ file, path, onDone }: Props) => {
    const router = useRouter()
    const listId = useId()
    const inputRef = useRef<HTMLInputElement>(null)
    const [sharing, setSharing] = useState<FileSharing | null>(null)
    const [loadError, setLoadError] = useState('')
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [draft, setDraft] = useState('')
    const [chips, setChips] = useState<string[]>([])
    const [role, setRole] = useState<ShareRole>('editor')
    const [notify, setNotify] = useState(true)
    const [message, setMessage] = useState('')
    const [busy, setBusy] = useState<string | null>(null)
    const [confirmTransfer, setConfirmTransfer] = useState<SharingPerson | null>(null)

    const load = useCallback(async () => {
        const result = await getFileSharing({ fileId: file.$id })
        if (result.ok) setSharing(result.data!)
        else setLoadError(result.error)
    }, [file.$id])

    useEffect(() => {
        load()
        getShareSuggestions().then(setSuggestions).catch(() => setSuggestions([]))
    }, [load])

    const myRole = sharing?.myRole
    const canShare = myRole === 'owner' || myRole === 'editor'
    const isOwner = myRole === 'owner'

    const addChips = (text: string) => {
        const parts = text.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean)
        if (parts.length === 0) return
        setChips((current) => [...new Set([...current, ...parts])])
        setDraft('')
    }

    // Runs a server action, shows its error, then reloads the dialog and the page behind it
    const run = async (key: string, action: () => Promise<{ ok: boolean, error?: string }>, success?: string) => {
        setBusy(key)
        try {
            const result = await action()
            if (!result.ok) {
                toast(result.error ?? 'Something went wrong', { className: 'error-toast' })
                return false
            }
            if (success) toast(success)
            await load()
            router.refresh()
            return true
        } finally {
            setBusy(null)
        }
    }

    const send = async () => {
        const all = [...chips, ...(draft.trim() ? [draft.trim().toLowerCase()] : [])]
        const invalid = all.find((e) => !EMAIL_PATTERN.test(e))
        if (invalid) {
            toast(`"${invalid}" isn't a valid email`, { className: 'error-toast' })
            return
        }
        setBusy('send')
        try {
            const result = await shareFile({ fileId: file.$id, emails: all, role, notify, message, path })
            if (!result.ok) {
                toast(result.error, { className: 'error-toast' })
                return
            }
            // Reload first so the new people appear in the list at the same moment the chips clear
            await load()
            const { added, alreadyHadAccess, notified } = result.data!
            const parts = []
            if (added.length) parts.push(`Shared with ${added.length} ${added.length === 1 ? 'person' : 'people'}`)
            if (alreadyHadAccess.length) parts.push(`${alreadyHadAccess.length} already had access`)
            if (notify && added.length && notified < added.length) parts.push(`${added.length - notified} email(s) couldn't be sent`)
            toast(parts.join(' · ') || 'Nothing changed')
            setChips([])
            setDraft('')
            setMessage('')
            router.refresh()
        } finally {
            setBusy(null)
        }
    }

    const copyLink = async () => {
        if (!sharing) return
        try {
            await navigator.clipboard.writeText(new URL(sharing.link, window.location.origin).toString())
            toast(sharing.linkAccess === 'anyone' ? 'Link copied' : 'Link copied. Only people with access can open it.')
        } catch {
            toast("Couldn't copy the link", { className: 'error-toast' })
        }
    }

    const changeLink = (access: LinkAccess) =>
        run('link', () => setLinkAccess({ fileId: file.$id, access, path }),
            access === 'anyone' ? 'Anyone with the link can now view' : 'Only people with access can open')

    const removeMe = async (person: SharingPerson) => {
        const ok = await run(person.email, () => removeShare({ fileId: file.$id, email: person.email, path }), 'Removed your access')
        if (ok) onDone()
    }

    const inviting = chips.length > 0

    const header = (
        <DialogHeader>
            <DialogTitle className='h4 truncate text-light-100'>Share &ldquo;{file.name}&rdquo;</DialogTitle>
            <DialogDescription className='sr-only'>Choose who can open this file and what they can do</DialogDescription>
        </DialogHeader>
    )

    if (!sharing) {
        return (
            <>
                {header}
                <div className='flex min-h-[160px] items-center justify-center'>
                    {loadError
                        ? <p className='body-2 text-error'>{loadError}</p>
                        : <Loader2 className='size-6 animate-spin text-brand' aria-label='Loading' />}
                </div>
            </>
        )
    }

    if (confirmTransfer) {
        return (
            <>
                {header}
                <div className='flex flex-col gap-4'>
                    <p className='body-2 text-light-100'>
                        Make <span className='font-semibold'>{confirmTransfer.name || confirmTransfer.email}</span> the owner?
                        They&apos;ll be able to delete the file and remove you. You&apos;ll stay on as an editor, and the file
                        will leave your folders.
                    </p>
                    <div className='flex flex-col gap-3 md:flex-row'>
                        <Button type='button' className='modal-cancel-button' onClick={() => setConfirmTransfer(null)}>Cancel</Button>
                        <Button
                            type='button'
                            className='modal-submit-button'
                            disabled={busy !== null}
                            onClick={async () => {
                                const ok = await run('transfer', () => transferOwnership({ fileId: file.$id, email: confirmTransfer.email, path }), 'Ownership transferred')
                                if (ok) setConfirmTransfer(null)
                            }}
                        >
                            Transfer ownership
                            {busy === 'transfer' && <Loader2 className='size-5 animate-spin' aria-hidden />}
                        </Button>
                    </div>
                </div>
            </>
        )
    }

    return (
        <>
            {header}

            {canShare && (
                <div className='flex flex-col gap-3'>
                    <div className='flex items-start gap-2'>
                        <div
                            className='flex min-h-[48px] flex-1 flex-wrap items-center gap-1.5 rounded-[20px] border border-light-200/60 px-3 py-2 focus-within:border-brand'
                            onClick={() => inputRef.current?.focus()}
                        >
                            {chips.map((email) => {
                                const valid = EMAIL_PATTERN.test(email)
                                return (
                                    <span key={email} className={cn('flex items-center gap-1 rounded-full py-1 pl-3 pr-1 text-sm', valid ? 'bg-light-300 text-light-100' : 'bg-red/15 text-error')}>
                                        {email}
                                        <button type='button' aria-label={`Remove ${email}`} className='rounded-full p-0.5 hover:bg-light-200/40' onClick={() => setChips(chips.filter((c) => c !== email))}>
                                            <X className='size-3.5' aria-hidden />
                                        </button>
                                    </span>
                                )
                            })}
                            <input
                                ref={inputRef}
                                type='email'
                                list={listId}
                                value={draft}
                                aria-label='Add people by email'
                                placeholder={inviting ? '' : 'Add people by email'}
                                className='body-2 min-w-[140px] flex-1 bg-transparent py-1 outline-none'
                                onChange={(e) => {
                                    const value = e.target.value
                                    if (/[,;\s]$/.test(value)) addChips(value)
                                    else setDraft(value)
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && draft.trim()) {
                                        e.preventDefault()
                                        addChips(draft)
                                    } else if (e.key === 'Backspace' && !draft && chips.length) {
                                        setChips(chips.slice(0, -1))
                                    }
                                }}
                                onBlur={() => draft.trim() && addChips(draft)}
                                onPaste={(e) => {
                                    const text = e.clipboardData.getData('text')
                                    if (/[,;\s]/.test(text.trim())) {
                                        e.preventDefault()
                                        addChips(text)
                                    }
                                }}
                            />
                            <datalist id={listId}>
                                {suggestions.filter((s) => !chips.includes(s)).map((s) => <option key={s} value={s} />)}
                            </datalist>
                        </div>
                        {inviting && <RoleMenu value={role} onChange={setRole} />}
                    </div>

                    {inviting && (
                        <>
                            <label className='flex cursor-pointer items-center gap-2 text-sm text-light-100'>
                                <input type='checkbox' checked={notify} onChange={(e) => setNotify(e.target.checked)} className='size-4 accent-brand' />
                                Notify people by email
                            </label>
                            {notify && (
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    maxLength={1000}
                                    rows={3}
                                    placeholder='Message (optional)'
                                    className='body-2 resize-none rounded-[20px] border border-light-200/60 px-4 py-3 outline-none focus:border-brand'
                                />
                            )}
                            <div className='flex flex-col gap-3 md:flex-row'>
                                <Button type='button' className='modal-cancel-button' onClick={() => { setChips([]); setDraft(''); setMessage('') }}>
                                    Cancel
                                </Button>
                                <Button type='button' className='modal-submit-button' disabled={busy !== null} onClick={send}>
                                    {notify ? 'Send' : 'Share'}
                                    {busy === 'send' && <Loader2 className='size-5 animate-spin' aria-hidden />}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {!inviting && (
                <>
                    <section className='flex flex-col gap-2'>
                        <h3 className='subtitle-2 text-light-100'>People with access</h3>
                        <ul className='flex max-h-[240px] flex-col gap-1 overflow-y-auto'>
                            {sharing.people.map((person) => (
                                <li key={person.email || 'owner'} className='flex items-center gap-3 py-1'>
                                    <Avatar person={person} />
                                    <div className='min-w-0 flex-1'>
                                        <p className='subtitle-2 truncate text-light-100'>
                                            {person.name || person.email}{person.isMe && ' (you)'}
                                        </p>
                                        <p className='caption truncate text-light-200'>
                                            {person.name ? person.email : person.hasAccount ? '' : 'No StoreIt account yet'}
                                        </p>
                                    </div>
                                    {person.role === 'owner' ? (
                                        <span className='px-3 text-sm text-light-200'>Owner</span>
                                    ) : canShare ? (
                                        <RoleMenu
                                            value={person.role}
                                            disabled={busy !== null}
                                            onChange={(next) => next !== person.role && run(person.email, () =>
                                                updateShareRole({ fileId: file.$id, email: person.email, role: next, path }), `${ROLE_LABEL[next]} access given`)}
                                        >
                                            {(isOwner || person.isMe) && <DropdownMenuSeparator />}
                                            {isOwner && (
                                                <DropdownMenuItem className='shad-dropdown-item pl-8' disabled={!person.hasAccount} onSelect={() => setConfirmTransfer(person)}>
                                                    Transfer ownership
                                                </DropdownMenuItem>
                                            )}
                                            {(isOwner || person.isMe) && (
                                                <DropdownMenuItem
                                                    className='shad-dropdown-item pl-8'
                                                    onSelect={() => person.isMe
                                                        ? removeMe(person)
                                                        : run(person.email, () => removeShare({ fileId: file.$id, email: person.email, path }), 'Access removed')}
                                                >
                                                    Remove access
                                                </DropdownMenuItem>
                                            )}
                                        </RoleMenu>
                                    ) : person.isMe ? (
                                        <DropdownMenu modal={false}>
                                            <DropdownMenuTrigger className='flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-sm text-light-100 hover:bg-light-300'>
                                                Viewer <ChevronDown className='size-4' aria-hidden />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align='end'>
                                                <DropdownMenuItem className='shad-dropdown-item' onSelect={() => removeMe(person)}>Remove access</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    ) : (
                                        <span className='px-3 text-sm text-light-200'>{ROLE_LABEL[person.role]}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className='flex flex-col gap-2'>
                        <h3 className='subtitle-2 text-light-100'>General access</h3>
                        <div className='flex items-center gap-3'>
                            <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', sharing.linkAccess === 'anyone' ? 'bg-green/20 text-green' : 'bg-light-300 text-light-100')}>
                                {sharing.linkAccess === 'anyone' ? <Globe className='size-4' aria-hidden /> : <Lock className='size-4' aria-hidden />}
                            </span>
                            <div className='min-w-0 flex-1'>
                                {isOwner ? (
                                    <DropdownMenu modal={false}>
                                        <DropdownMenuTrigger disabled={busy !== null} className='subtitle-2 flex items-center gap-1 rounded-full py-1 text-light-100'>
                                            {sharing.linkAccess === 'anyone' ? 'Anyone with the link' : 'Restricted'}
                                            {busy === 'link' ? <Loader2 className='size-4 animate-spin' aria-hidden /> : <ChevronDown className='size-4' aria-hidden />}
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align='start'>
                                            {(['restricted', 'anyone'] as LinkAccess[]).map((access) => (
                                                <DropdownMenuItem key={access} className='shad-dropdown-item gap-2' onSelect={() => access !== sharing.linkAccess && changeLink(access)}>
                                                    <Check className={cn('size-4', access !== sharing.linkAccess && 'invisible')} aria-hidden />
                                                    {access === 'anyone' ? 'Anyone with the link' : 'Restricted'}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                ) : (
                                    <p className='subtitle-2 text-light-100'>{sharing.linkAccess === 'anyone' ? 'Anyone with the link' : 'Restricted'}</p>
                                )}
                                <p className='caption text-light-200'>
                                    {sharing.linkAccess === 'anyone'
                                        ? 'Anyone on the internet with the link can view'
                                        : 'Only people with access can open with the link'}
                                </p>
                            </div>
                        </div>
                    </section>

                    <div className='flex flex-col gap-3 md:flex-row'>
                        <Button type='button' className='modal-cancel-button gap-2 border border-light-200/60' onClick={copyLink}>
                            <Link2 className='size-4' aria-hidden /> Copy link
                        </Button>
                        <Button type='button' className='modal-submit-button' onClick={onDone}>Done</Button>
                    </div>
                </>
            )}
        </>
    )
}

export default ShareDialog
