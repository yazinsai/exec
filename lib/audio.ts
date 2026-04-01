import { Audio } from "expo-av";
import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  moveAsync,
  copyAsync,
  deleteAsync,
} from "expo-file-system/legacy";

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

/**
 * Try to extract a timestamp from the filename.
 * Common patterns:
 * - Recording_20241215_143052.m4a (Samsung voice recorder)
 * - VN_20241215_143052.m4a (some voice note apps)
 * - 2024-12-15_14-30-52.m4a
 * - 20241215143052.m4a
 * - audio_2024_12_15_14_30_52.m4a
 * - Jan 6 at 5-16 AM.m4a (Google Voice Recorder)
 */
function extractDateFromFilename(filename: string): number | null {
  // Remove extension and path
  const basename = filename.split("/").pop()?.replace(/\.\w+$/, "") ?? "";

  // Pattern 1: YYYYMMDD_HHMMSS or YYYYMMDD-HHMMSS (e.g., Recording_20241215_143052)
  const pattern1 = basename.match(/(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/);
  if (pattern1) {
    const [, year, month, day, hour, min, sec] = pattern1;
    const date = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(min),
      parseInt(sec)
    );
    if (!isNaN(date.getTime())) return date.getTime();
  }

  // Pattern 2: YYYY-MM-DD_HH-MM-SS or YYYY_MM_DD_HH_MM_SS
  const pattern2 = basename.match(/(\d{4})[_-](\d{2})[_-](\d{2})[_-](\d{2})[_-](\d{2})[_-](\d{2})/);
  if (pattern2) {
    const [, year, month, day, hour, min, sec] = pattern2;
    const date = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(min),
      parseInt(sec)
    );
    if (!isNaN(date.getTime())) return date.getTime();
  }

  // Pattern 3: Just YYYYMMDDHHMMSS (14 digits)
  const pattern3 = basename.match(/(\d{14})/);
  if (pattern3) {
    const digits = pattern3[1];
    const year = parseInt(digits.slice(0, 4));
    const month = parseInt(digits.slice(4, 6)) - 1;
    const day = parseInt(digits.slice(6, 8));
    const hour = parseInt(digits.slice(8, 10));
    const min = parseInt(digits.slice(10, 12));
    const sec = parseInt(digits.slice(12, 14));
    const date = new Date(year, month, day, hour, min, sec);
    if (!isNaN(date.getTime()) && year >= 2000 && year <= 2100) return date.getTime();
  }

  // Pattern 4: Google Voice Recorder - "Jan 6 at 5-16 AM" or "Dec 25 at 10-05 PM"
  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const pattern4 = basename.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+at\s+(\d{1,2})-(\d{2})\s*(AM|PM)$/i);
  if (pattern4) {
    const [, monthStr, dayStr, hourStr, minStr, ampm] = pattern4;
    const monthIndex = monthMap[monthStr.toLowerCase()];
    if (monthIndex !== undefined) {
      let hour = parseInt(hourStr);
      const min = parseInt(minStr);
      const day = parseInt(dayStr);

      // Convert 12-hour to 24-hour format
      if (ampm.toUpperCase() === "PM" && hour !== 12) {
        hour += 12;
      } else if (ampm.toUpperCase() === "AM" && hour === 12) {
        hour = 0;
      }

      // Guess the year: if January, assume current year; otherwise previous year
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const year = monthIndex === 0 && currentMonth === 0 ? currentYear : currentYear - (monthIndex > currentMonth ? 1 : 0);

      const date = new Date(year, monthIndex, day, hour, min, 0);
      if (!isNaN(date.getTime())) return date.getTime();
    }
  }

  return null;
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

  // Try to extract date from filename first (most reliable for shared files)
  // Then fall back to file modification time, then current time
  const filenameDate = extractDateFromFilename(sourceUri);
  const modTime = sourceInfo.modificationTime ?? Math.floor(Date.now() / 1000);
  const modTimeMs = modTime * 1000;

  // Use filename date if found and it's reasonable (not in the future, not too old)
  const now = Date.now();
  const tenYearsAgo = now - 10 * 365 * 24 * 60 * 60 * 1000;
  const createdAt =
    filenameDate && filenameDate <= now && filenameDate >= tenYearsAgo
      ? filenameDate
      : modTimeMs;

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
