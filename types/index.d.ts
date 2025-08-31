import { Models } from "node-appwrite";


declare type FileType = "document" | "image" | "video" | "audio" | "other";

export interface UploadFileProps {
    file: File,
    ownerId: string,
    accountId: string
    path: string
}

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

}
export interface UserDocument extends fileDocument {
    fullName: string,
    email: string,
    avatar: string,
    accountId: string,
    otp: string,
    expireAt; Date,
}

declare interface ActionType {
    label: string;
    icon: string;
    value: string;
}
