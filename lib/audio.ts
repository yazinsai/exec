import { Audio } from "expo-av";
import {
  documentDirectory,
  cacheDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  moveAsync,
  copyAsync,
  deleteAsync,
  downloadAsync,
} from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export const RECORDINGS_DIR = `${documentDirectory}recordings/`;

// File size limits (in bytes)
export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB - skip cloud upload for larger
export const MAX_TRANSCRIPTION_SIZE = 25 * 1024 * 1024; // 25MB - Groq limit

export const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: ".m4a",
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: ".m4a",
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 128000,
  },
};

export async function ensureRecordingsDir(): Promise<void> {
  const dirInfo = await getInfoAsync(RECORDINGS_DIR);
  if (!dirInfo.exists) {
    await makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
  }
}

export async function saveRecordingLocally(
  recording: Audio.Recording,
  recordingId: string
): Promise<{ filePath: string; duration: number }> {
  await ensureRecordingsDir();

  const uri = recording.getURI();
  if (!uri) {
    throw new Error("Recording URI not available");
  }

  const status = await recording.getStatusAsync();
  const duration = status.durationMillis ? status.durationMillis / 1000 : 0;

  const filePath = `${RECORDINGS_DIR}${recordingId}.m4a`;
  await moveAsync({ from: uri, to: filePath });

  return { filePath, duration };
}

export async function deleteLocalRecording(filePath: string): Promise<void> {
  try {
    const info = await getInfoAsync(filePath);
    if (info.exists) {
      await deleteAsync(filePath);
    }
  } catch (error) {
    console.warn("Failed to delete local recording:", error);
  }
}

export async function getLocalFileInfo(filePath: string) {
  return getInfoAsync(filePath);
}

export async function readFileAsBlob(filePath: string): Promise<Blob> {
  const fileInfo = await getInfoAsync(filePath);
  if (!fileInfo.exists) {
    throw new Error(`File not found: ${filePath}`);
  }

  const response = await fetch(fileInfo.uri);
  return response.blob();
}

export async function exportRecording(
  localFilePath: string,
  cloudUrl?: string
): Promise<void> {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device");
  }

  const localInfo = await getInfoAsync(localFilePath);

  if (localInfo.exists) {
    await Sharing.shareAsync(localFilePath, {
      mimeType: "audio/x-m4a",
      dialogTitle: "Export Recording",
    });
    return;
  }

  if (cloudUrl) {
    const tempPath = `${cacheDirectory}temp_recording.m4a`;
    await downloadAsync(cloudUrl, tempPath);
    await Sharing.shareAsync(tempPath, {
      mimeType: "audio/x-m4a",
      dialogTitle: "Export Recording",
    });
    await deleteAsync(tempPath, { idempotent: true });
    return;
  }

  throw new Error("Audio file not found locally or in cloud");
}

export async function requestAudioPermissions(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === "granted";
}

export async function configureAudioMode(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
}

export async function getFileSize(filePath: string): Promise<number> {
  const info = await getInfoAsync(filePath);
  if (!info.exists) {
    throw new Error(`File not found: ${filePath}`);
  }
  return info.size ?? 0;
}

export interface ImportResult {
  filePath: string;
  fileSize: number;
  duration: number;
  createdAt: number;
  sourceFingerprint: string;
  exceedsUploadLimit: boolean;
  exceedsTranscriptionLimit: boolean;
}

export async function importSharedAudio(
  sourceUri: string,
  recordingId: string
): Promise<ImportResult> {
  await ensureRecordingsDir();

  // Get source file info BEFORE copying (to preserve original timestamps)
  const sourceInfo = await getInfoAsync(sourceUri);
  if (!sourceInfo.exists) {
    throw new Error("Source audio file not found");
  }
  // Use file's modification time, fallback to now
  const modTime = sourceInfo.modificationTime ?? Math.floor(Date.now() / 1000);
  const createdAt = modTime * 1000; // Convert seconds to ms

  // Generate fingerprint for deduplication (size:modTime)
  const sourceFingerprint = `${sourceInfo.size ?? 0}:${modTime}`;

  // Determine extension from source or default to .m4a
  const ext = sourceUri.match(/\.\w+$/)?.[0] ?? ".m4a";
  const destPath = `${RECORDINGS_DIR}${recordingId}${ext}`;

  // Copy file (safer than move for shared content)
  await copyAsync({ from: sourceUri, to: destPath });

  const info = await getInfoAsync(destPath);
  if (!info.exists) {
    throw new Error("Failed to copy shared audio file");
  }
  const fileSize = info.size ?? 0;

  // Try to get duration from the audio file
  let duration = 0;
  try {
    const { sound, status } = await Audio.Sound.createAsync({ uri: destPath });
    if (status.isLoaded && status.durationMillis) {
      duration = status.durationMillis / 1000;
    }
    await sound.unloadAsync();
  } catch {
    // Duration detection failed, leave as 0
  }

  return {
    filePath: destPath,
    fileSize,
    duration,
    createdAt,
    sourceFingerprint,
    exceedsUploadLimit: fileSize > MAX_UPLOAD_SIZE,
    exceedsTranscriptionLimit: fileSize > MAX_TRANSCRIPTION_SIZE,
  };
}
