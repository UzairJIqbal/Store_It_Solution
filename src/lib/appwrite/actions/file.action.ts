'use server'

import { createAdminClient, createSessionClient } from ".."
import { fileDocument, FileType, GetFilesProps, UploadFileProps } from "../../../../types"
import { InputFile } from "node-appwrite/file"
import { appwriteConfig } from "../config"
import { ID, Models, Query } from "node-appwrite"
import { constructFileUrl, getFileType, paresStringify } from "@/lib/utils"
import { any, email, file, size, string } from "zod"
import { revalidatePath } from "next/cache"
import { getCurrentUser } from "./user.action"
import { fi } from "zod/v4/locales"


const createQueries = (currentUser: Models.Document & { email: string }, types: string[], searchText: string, sort: string, limit: number | undefined) => {
    const queries = [
        Query.or([
            Query.equal("ownerId", [currentUser.$id]),
            Query.contains("users", [currentUser.email]),
        ])
    ]
    if (types.length > 0) {
        queries.push(
            Query.equal('type', types)
        )
    }
    if (searchText) {
        queries.push(
            Query.contains('name', searchText)
        )
    }
    if (limit) {
        queries.push(
            Query.limit(limit)
        )
    }

    const [sortBy, orderBy] = sort.split("-")
    queries.push(
        orderBy === 'asc' ? Query.orderAsc(sortBy) : Query.orderDesc(sortBy)
    )

    return queries
}


export const UploadFile = async ({ file, ownerId, accountId, path }: UploadFileProps) => {

    const handleError = (error: unknown, message: string) => {
        console.log(error, message);
        throw error;
    };

    const { storage, databases } = await createAdminClient()
    try {
        const inputFile = InputFile.fromBuffer(file, file.name)
        const bucketFile = await storage.createFile(
            appwriteConfig.bucketId,
            ID.unique(),
            inputFile
        )


        const fileDocument = {
            type: getFileType(bucketFile.name).type,
            name: bucketFile.name,
            url: constructFileUrl(bucketFile.$id),
            size: bucketFile.sizeOriginal,
            extension: getFileType(bucketFile.name).extension,
            ownerId,
            accountId,
            users: [],
            bucketField: bucketFile.$id
        }

        const newFile = await databases.createDocument(
            appwriteConfig.databaseId,
            appwriteConfig.filesCollectionId,
            ID.unique(),
            fileDocument
        )

            .catch(async (error: unknown) => {
                await storage.deleteFile(appwriteConfig.bucketId, bucketFile.$id);
                handleError(error, "Failed to create file document");
            });

        revalidatePath(path);

        return paresStringify(newFile)
    } catch (error: any) {
        handleError(error, "Failed to updload");
    }
}

export const getFiles = async ({ types = [], searchText = '', sort = '$createdAt-desc', limit }: GetFilesProps) => {
    const { databases } = await createAdminClient()
    try {
        const currentUser = await getCurrentUser()


        if (!currentUser) {
            throw new Error("User not Found");
        }
        const queries = createQueries(currentUser, types, searchText, sort, limit)


        const files = await databases.listDocuments(
            appwriteConfig.databaseId,
            appwriteConfig.filesCollectionId,
            queries
        )


        return paresStringify(files)
    } catch (error: any) {
        console.error("Error in Getting Files", error);

    }
}

export const renameFile = async ({ fileId, name, extension, path }: { fileId: string, name: string, extension: string, path: string }) => {
    const { databases } = await createAdminClient()
    try {
        const newName = `${name}.${extension}`
        const updateFile = await databases.updateDocument(

            appwriteConfig.databaseId,
            appwriteConfig.filesCollectionId,
            fileId,
            {
                name: newName
            }
        )
        revalidatePath(path)
        return paresStringify(updateFile)
    } catch (error: any) {
        console.log("The error to rename the file is this", error);
        throw new Error("Failed to rename the file");


    }
}


export const updateFileUsers = async ({ fileId, emails, path }: { fileId: string, emails: string[], path: string }) => {
    console.log("The email coming from the frontend is this", email);

    const { databases } = await createAdminClient()
    try {
        const updateFile = await databases.updateDocument(

            appwriteConfig.databaseId,
            appwriteConfig.filesCollectionId,
            fileId,
            {
                users: emails
            }
        )
        revalidatePath(path)
        return paresStringify(updateFile)
    } catch (error: any) {
        console.log("The error to rename the file is this", error);
        throw new Error("Failed to rename the file");


    }
}

export const deleteFileUsers = async ({ fileId, bucketFileId, path }: { fileId: string, bucketFileId: string, path: string }) => {

    const { databases, storage } = await createAdminClient()
    try {
        const deletefile = await databases.deleteDocument(

            appwriteConfig.databaseId,
            appwriteConfig.filesCollectionId,
            fileId,
        )

        if (deletefile) {
            await storage.deleteFile(appwriteConfig.bucketId, bucketFileId)
        }
        revalidatePath(path)
        return paresStringify(deletefile)
    } catch (error: any) {
        console.log("The error to delete the file is this", error);
        throw new Error("Failed to delete the file");


    }
}

export const getTotalSpaceUsed = async () => {
    try {
        const { databases } = await createSessionClient()
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            throw new Error("User is not authenticated");
        }
        const files = await databases.listDocuments(
            appwriteConfig.databaseId,
            appwriteConfig.filesCollectionId,
            [
                Query.equal("ownerId", [currentUser.$id])
            ]
        )

        const totalSpace = {
            image: { size: 0, latestDate: "" },
            document: { size: 0, latestDate: "" },
            audio: { size: 0, latestDate: "" },
            video: { size: 0, latestDate: "" },
            other: { size: 0, latestDate: "" },
            used: 0,
            all: 2 * 1024 * 1024 * 1024
        }

        files.documents.map((file) => {
            const fileType = file.type as FileType;
            totalSpace[fileType].size += file.size;
            totalSpace.used += file.size
            if (!totalSpace[fileType].latestDate || new Date(file.$updatedAt) > new Date(totalSpace[fileType].latestDate)) {
                totalSpace[fileType].latestDate = file.$updatedAt
            }
        })

        return paresStringify(totalSpace)

    } catch (error: any) {
        console.error("Error in updating your total space", error);

    }
}