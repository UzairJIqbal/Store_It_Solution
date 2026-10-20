export const navItems = [
    {
        name: "Home",
        icon: "/assets/icons/dashboard.svg",
        url: "/",
    },
    {
        name: "My Files",
        icon: "/assets/icons/folder.svg",
        url: "/files",
    },
    {
        name: "Shared with me",
        icon: "/assets/icons/shared.svg",
        url: "/shared",
    },
    {
        name: "Recent",
        icon: "/assets/icons/recent.svg",
        url: "/recent",
    },
    {
        name: "Starred",
        icon: "/assets/icons/starred.svg",
        url: "/starred",
    },
    {
        name: "Documents",
        icon: "/assets/icons/documents.svg",
        url: "/documents",
    },
    {
        name: "Images",
        icon: "/assets/icons/images.svg",
        url: "/images",
    },
    {
        name: "Media",
        icon: "/assets/icons/video.svg",
        url: "/media",
    },
    {
        name: "Others",
        icon: "/assets/icons/others.svg",
        url: "/others",
    },
    {
        name: "Drop links",
        icon: "/assets/icons/drops.svg",
        url: "/drops",
    },
    {
        name: "Trash",
        icon: "/assets/icons/trash.svg",
        url: "/trash",
    },
    {
        name: "Storage",
        icon: "/assets/icons/storage.svg",
        url: "/storage",
    },
];

export const actionsDropdownItems = [
    {
        label: "Rename",
        icon: "/assets/icons/edit.svg",
        value: "rename",
    },
    {
        label: "Details",
        icon: "/assets/icons/info.svg",
        value: "details",
    },
    {
        label: "Share",
        icon: "/assets/icons/share.svg",
        value: "share",
    },
    {
        label: "Download",
        icon: "/assets/icons/download.svg",
        value: "download",
    },
    {
        label: "Move to trash",
        icon: "/assets/icons/delete.svg",
        value: "trash",
    },
];

export const sortTypes = [
    {
        label: "Date created (newest)",
        value: "$createdAt-desc",
    },
    {
        label: "Created Date (oldest)",
        value: "$createdAt-asc",
    },
    {
        label: "Name (A-Z)",
        value: "name-asc",
    },
    {
        label: "Name (Z-A)",
        value: "name-desc",
    },
    {
        label: "Size (Highest)",
        value: "size-desc",
    },
    {
        label: "Size (Lowest)",
        value: "size-asc",
    },
];

export const avatarPlaceholderUrl =
    "https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg";

// Appwrite's Free plan caps a single file at 50 MB (decimal), and the bucket's limit is set to match
export const MAX_FILE_SIZE = 50_000_000;

// Per-user storage shown by the storage meter
export const STORAGE_LIMIT = 2 * 1024 * 1024 * 1024;