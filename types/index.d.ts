import { Models } from "node-appwrite";


declare type FileType = "document" | "image" | "video" | "audio" | "other";

declare interface GetFilesProps {
    types?: FileType[];
    searchText?: string;
    sort?: string;
    limit?: number;
}

declare interface SearchParamProps {
    params?: Promise<SegmentParams>;
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export interface fileDocument extends Models.Document {
    name: string
    type: string
    url: string
    size: number
    extension: string
    ownerId: UserDocument
    accountId: string
    users: string[]
    bucketField: string
    folderId?: string | null
    linkAccess?: LinkAccess | null
    linkToken?: string | null
    trashedAt?: string | null
    trashedBy?: string | null
    trashedRoot?: string | null
    versionCount?: number | null
    currentVersionAt?: string | null
    // Added by the server when listing: the caller's role on this file
    role?: FileRole
    // Added by the server from the caller's fileStates row
    isStarred?: boolean
    // Set on folder listings: shared with someone, or open to anyone with the link
    isShared?: boolean
    lastOpenedAt?: string | null
    // Smart tags, worked out in the browser at upload (src/lib/smart/analyze.ts); missing on files from before them
    tags?: string[] | null
    // Start of the text of text-like files; only on the server, toClientFile drops it
    content?: string | null
}

export interface FileStateDocument extends Models.Document {
    userId: string
    fileId: string
    isStarred: boolean
    starredAt?: string | null
    lastOpenedAt?: string | null
}

export interface FileVersionDocument extends Models.Document {
    fileId: string
    bucketFileId: string
    name: string
    size: number
    extension?: string | null
    uploadedBy: string
    uploadedAt: string
    number: number
}

export type ActivityAction =
    | "upload" | "rename" | "move" | "share" | "unshare" | "role" | "link" | "transfer"
    | "trash" | "restore" | "version" | "version_delete"

export interface ActivityDocument extends Models.Document {
    fileId?: string | null
    folderId?: string | null
    actorId: string
    actorName: string
    action: ActivityAction
    detail?: string | null
}

export type FileRole = "viewer" | "editor" | "owner"
export type ShareRole = "viewer" | "editor"
export type LinkAccess = "restricted" | "anyone"

export interface ShareDocument extends Models.Document {
    fileId: string
    ownerId: string
    email: string
    role: ShareRole
    sharedBy: string
}

export interface FolderDocument extends Models.Document {
    name: string
    parentId: string | null
    ancestors: string[]
    ownerId: string
    accountId: string
    users: string[]
    trashedAt?: string | null
    trashedBy?: string | null
    trashedRoot?: string | null
}

export interface Crumb {
    id: string
    name: string
}
export interface UserDocument extends fileDocument {
    fullName: string,
    email: string,
    avatar: string,
    accountId: string,
    otp: string,
    expireAt: Date,
    otpAttempts?: number,
}

declare interface ActionType {
    label: string;
    icon: string;
    value: string;
}

// A public "drop" link: anyone with it can upload files into one of the owner's folders
export interface DropDocument extends Models.Document {
    ownerId: string
    accountId: string
    code: string
    title: string
    message?: string | null
    folderId?: string | null
    uploaderId: string
    enabled: boolean
    expiresAt?: string | null
    maxFiles: number
    filesReceived: number
    lastReceivedAt?: string | null
}
