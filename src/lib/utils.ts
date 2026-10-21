import { clsx, type ClassValue } from "clsx"
import { Segment } from "next/dist/server/app-render/types"
import { twMerge } from "tailwind-merge"
import { json, size } from "zod"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const paresStringify = (value: unknown) => {
  return JSON.parse(JSON.stringify(value))
}

export const constructFileUrl = (bucketFileId: string) => {
  return `${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/storage/buckets/${process.env.NEXT_PUBLIC_APPWRITE_BUCKET}/files/${bucketFileId}/view?project=${process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID}`;
};

declare type FileType = "document" | "image" | "video" | "audio" | "other";

export const getFileType = (fileName: string) => {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (!extension) return { type: "other", extension: "" };

  const documentExtensions = [
    "pdf",
    "doc",
    "docx",
    "txt",
    "xls",
    "xlsx",
    "csv",
    "rtf",
    "ods",
    "ppt",
    "odp",
    "md",
    "html",
    "htm",
    "epub",
    "pages",
    "fig",
    "psd",
    "ai",
    "indd",
    "xd",
    "sketch",
    "afdesign",
    "afphoto",
    "afphoto",
  ];
  const imageExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"];
  const videoExtensions = ["mp4", "avi", "mov", "mkv", "webm"];
  const audioExtensions = ["mp3", "wav", "ogg", "flac"];

  if (documentExtensions.includes(extension)) return { type: "document", extension };
  if (imageExtensions.includes(extension)) return { type: "image", extension };
  if (videoExtensions.includes(extension)) return { type: "video", extension };
  if (audioExtensions.includes(extension)) return { type: "audio", extension };

  return { type: "other", extension };
};
export const getFileIcon = (
  extension: string | undefined,
  type: FileType | string,
) => {
  switch (extension) {
    // Document
    case "pdf":
      return "/assets/icons/file-pdf.svg";
    case "doc":
      return "/assets/icons/file-doc.svg";
    case "docx":
      return "/assets/icons/file-docx.svg";
    case "csv":
      return "/assets/icons/file-csv.svg";
    case "txt":
      return "/assets/icons/file-txt.svg";
    case "xls":
    case "xlsx":
      return "/assets/icons/file-document.svg";
    // Image
    case "svg":
      return "/assets/icons/file-image.svg";
    // Video
    case "mkv":
    case "mov":
    case "avi":
    case "wmv":
    case "mp4":
    case "flv":
    case "webm":
    case "m4v":
    case "3gp":
      return "/assets/icons/file-video.svg";
    // Audio
    case "mp3":
    case "mpeg":
    case "wav":
    case "aac":
    case "flac":
    case "ogg":
    case "wma":
    case "m4a":
    case "aiff":
    case "alac":
      return "/assets/icons/file-audio.svg";

    default:
      switch (type) {
        case "image":
          return "/assets/icons/file-image.svg";
        case "document":
          return "/assets/icons/file-document.svg";
        case "video":
          return "/assets/icons/file-video.svg";
        case "audio":
          return "/assets/icons/file-audio.svg";
        default:
          return "/assets/icons/file-other.svg";
      }
  }
};

export const convertFileSize = (sizeInBytes: number, digits?: number) => {
  if (sizeInBytes < 1024) {
    return sizeInBytes + " Bytes"; // Less than 1 KB, show in Bytes
  } else if (sizeInBytes < 1024 * 1024) {
    const sizeInKB = sizeInBytes / 1024;
    return sizeInKB.toFixed(digits || 1) + " KB"; // Less than 1 MB, show in KB
  } else if (sizeInBytes < 1024 * 1024 * 1024) {
    const sizeInMB = sizeInBytes / (1024 * 1024);
    return sizeInMB.toFixed(digits || 1) + " MB"; // Less than 1 GB, show in MB
  } else {
    const sizeInGB = sizeInBytes / (1024 * 1024 * 1024);
    return sizeInGB.toFixed(digits || 1) + " GB"; // 1 GB or more, show in GB
  }
};
export const formatDateTime = (isoString: string | null | undefined) => {
  if (!isoString) return "—";

  const date = new Date(isoString);

  // Get hours and adjust for 12-hour format
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? "pm" : "am";

  // Convert hours to 12-hour format
  hours = hours % 12 || 12;

  // Format the time and date parts
  const time = `${hours}:${minutes.toString().padStart(2, "0")}${period}`;
  const day = date.getDate();
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = monthNames[date.getMonth()];

  return `${time}, ${day} ${month}`;
};
// The bucket is private: bytes are served by /api/files/[id] after an access check.
// A public link token (from /s/[token]) lets people without an account through.
export const fileViewUrl = (fileId: string, linkToken?: string) =>
  `/api/files/${fileId}${linkToken ? `?t=${encodeURIComponent(linkToken)}` : ""}`;

export const fileDownloadUrl = (fileId: string, linkToken?: string) =>
  `/api/files/${fileId}?download=1${linkToken ? `&t=${encodeURIComponent(linkToken)}` : ""}`;
export const getFileTypesParams = (type: string) => {
  switch (type) {
    case "documents":
      return ["document"];
    case "images":
      return ["image"];
    case "media":
      return ["video", "audio"];
    case "others":
      return ["other"];
    default:
      return ["document"];
  }
};

export const getUsageSummary = (totalSpace: any) => {
  return [
    {
      title: "document",
      size: totalSpace.document.size,
      latestDate: totalSpace.document.latestDate,
      icon: "/assets/icons/file-document-light.svg",
      url: "/documents",
    },
    {
      title: "Images",
      size: totalSpace.image.size,
      latestDate: totalSpace.image.latestDate,
      icon: "/assets/icons/file-image-light.svg",
      url: "/images",
    },
    {
      title: "Media",
      size: totalSpace.video.size + totalSpace.audio.size,
      latestDate:
        totalSpace.video.latestDate > totalSpace.audio.latestDate
          ? totalSpace.video.latestDate
          : totalSpace.audio.latestDate,
      icon: "/assets/icons/file-video-light.svg",
      url: "/media",
    },
    {
      title: "Others",
      size: totalSpace.other.size,
      latestDate: totalSpace.other.latestDate,
      icon: "/assets/icons/file-other-light.svg",
      url: "/others",
    },

  ]
}

export type UsageLevel = "normal" | "warning" | "critical";

export const getUsageLevel = (percent: number): UsageLevel => {
  if (percent >= 95) return "critical";
  if (percent >= 80) return "warning";
  return "normal";
};

// Small non-zero usage reads as "<1%" rather than a misleading "0%"
export const formatUsagePercent = (percent: number) => {
  if (percent <= 0) return "0%";
  if (percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
};

export const calculatePercentage = (sizeInBytes: number) => {
  const totalSizeInBytes = 2 * 1024 * 1024 * 1024; // 2GB in bytes
  const percentage = (sizeInBytes / totalSizeInBytes) * 100;
  return Number(percentage.toFixed(2));
};

// Folder pages live under /folders/<id> but belong to the "My Files" nav item
export const isNavActive = (pathname: string, url: string) =>
  pathname === url || (url === "/files" && pathname.startsWith("/folders/"));

// Recency groups, newest first, used by the Shared, Recent and Trash lists
export const recencyGroup = (iso: string, now: Date) => {
    const date = new Date(iso)
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const day = 24 * 60 * 60 * 1000
    if (date >= startOfDay) return 'Today'
    if (date >= new Date(startOfDay.getTime() - day)) return 'Yesterday'
    if (date >= new Date(startOfDay.getTime() - 6 * day)) return 'Earlier this week'
    if (date >= new Date(now.getFullYear(), now.getMonth(), 1)) return 'Earlier this month'
    if (date >= new Date(now.getFullYear(), now.getMonth() - 1, 1)) return 'Last month'
    if (date >= new Date(now.getFullYear(), 0, 1)) return 'Earlier this year'
    return 'Older'
}

// Groups items by recencyGroup, keeping their order
export const groupByRecency = <T,>(items: T[], at: (item: T) => string, now = new Date()) => {
    const groups = new Map<string, T[]>()
    for (const item of items) {
        const group = recencyGroup(at(item), now)
        groups.set(group, [...(groups.get(group) ?? []), item])
    }
    return [...groups.entries()]
}

// Things that arrived from someone else in the last two days get an ember "New" mark
const NEW_WINDOW_MS = 2 * 24 * 60 * 60 * 1000
export const isRecentArrival = (date: string | Date | null | undefined, now: Date = new Date()) =>
  !!date && now.getTime() - new Date(date).getTime() < NEW_WINDOW_MS
