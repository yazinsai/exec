import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  copyAsync,
} from "expo-file-system/legacy";
import { db } from "./db";

export const IMAGES_DIR = `${documentDirectory}images/`;

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif"];

export function isImageFile(file: { mimeType?: string; path?: string; filePath?: string }): boolean {
  if (file.mimeType?.startsWith("image/")) {
    return true;
  }
  const path = (file.path || file.filePath)?.toLowerCase() || "";
  return IMAGE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

export function getMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

async function ensureImagesDir(): Promise<void> {
  const dirInfo = await getInfoAsync(IMAGES_DIR);
  if (!dirInfo.exists) {
    await makeDirectoryAsync(IMAGES_DIR, { intermediates: true });
  }
}

export interface ImportedImage {
  localPath: string;
  originalPath: string;
}

export async function importSharedImage(
  sourceUri: string,
  imageId: string
): Promise<ImportedImage> {
  await ensureImagesDir();

  const sourceInfo = await getInfoAsync(sourceUri);
  if (!sourceInfo.exists) {
    throw new Error("Source image file not found");
  }

  const ext = sourceUri.match(/\.\w+$/)?.[0] ?? ".jpg";
  const destPath = `${IMAGES_DIR}${imageId}${ext}`;

  await copyAsync({ from: sourceUri, to: destPath });

  const info = await getInfoAsync(destPath);
  if (!info.exists) {
    throw new Error("Failed to copy shared image file");
  }

  return {
    localPath: destPath,
    originalPath: sourceUri,
  };
}

async function readFileAsBlob(filePath: string): Promise<Blob> {
  const fileInfo = await getInfoAsync(filePath);
  if (!fileInfo.exists) {
    throw new Error(`File not found: ${filePath}`);
  }
  const response = await fetch(fileInfo.uri);
  return response.blob();
}

export async function uploadImageToStorage(
  localFilePath: string,
  recordingId: string,
  imageIndex: number
): Promise<string> {
  const blob = await readFileAsBlob(localFilePath);
  const mimeType = getMimeType(localFilePath);
  const ext = localFilePath.match(/\.\w+$/)?.[0] ?? ".jpg";
  const fileName = `${recordingId}_${imageIndex}${ext}`;

  const file = new File([blob], fileName, { type: mimeType });
  const storagePath = `images/${fileName}`;

  const { data } = await db.storage.uploadFile(storagePath, file);

  await db.transact(db.tx.recordings[recordingId].link({ images: data.id }));

  return data.id;
}
