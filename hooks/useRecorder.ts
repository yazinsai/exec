import { useState, useCallback, useRef, useEffect } from "react";
import { Audio } from "expo-av";
import { id } from "@instantdb/react-native";
import { db } from "@/lib/db";
import {
  RECORDING_OPTIONS,
  saveRecordingLocally,
  requestAudioPermissions,
  configureAudioMode,
} from "@/lib/audio";
import { uploadImageToStorage } from "@/lib/image";
import type { PendingImage } from "./useShareIntent";

export type RecorderState = "idle" | "recording" | "paused" | "saving";

const METERING_OPTIONS: Audio.RecordingOptions = {
  ...RECORDING_OPTIONS,
  isMeteringEnabled: true,
};

export function useRecorder(onRecordingComplete?: () => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [duration, setDuration] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [metering, setMetering] = useState<number>(-160);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingImagesRef = useRef<PendingImage[]>([]);

  useEffect(() => {
    requestAudioPermissions().then(setHasPermission);
  }, []);

  const startRecording = useCallback(async (pendingImages?: PendingImage[]) => {
    if (state !== "idle" || hasPermission === false) {
      return;
    }

    pendingImagesRef.current = pendingImages ?? [];

    try {
      await configureAudioMode();

      const { recording } = await Audio.Recording.createAsync(METERING_OPTIONS);
      recordingRef.current = recording;
      setState("recording");
      setDuration(0);

      durationIntervalRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);

      meteringIntervalRef.current = setInterval(async () => {
        if (recordingRef.current) {
          try {
            const status = await recordingRef.current.getStatusAsync();
            if (status.isRecording && status.metering !== undefined) {
              setMetering(status.metering);
            }
          } catch {
            // ignore metering errors
          }
        }
      }, 100);
    } catch (error) {
      console.error("Failed to start recording:", error);
      setState("idle");
    }
  }, [state, hasPermission]);

  const pauseRecording = useCallback(async () => {
    if (state !== "recording" || !recordingRef.current) {
      return;
    }

    try {
      await recordingRef.current.pauseAsync();
      setState("paused");

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      if (meteringIntervalRef.current) {
        clearInterval(meteringIntervalRef.current);
        meteringIntervalRef.current = null;
      }
    } catch (error) {
      console.error("Failed to pause recording:", error);
    }
  }, [state]);

  const resumeRecording = useCallback(async () => {
    if (state !== "paused" || !recordingRef.current) {
      return;
    }

    try {
      await recordingRef.current.startAsync();
      setState("recording");

      durationIntervalRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);

      meteringIntervalRef.current = setInterval(async () => {
        if (recordingRef.current) {
          try {
            const status = await recordingRef.current.getStatusAsync();
            if (status.isRecording && status.metering !== undefined) {
              setMetering(status.metering);
            }
          } catch {
            // ignore metering errors
          }
        }
      }, 100);
    } catch (error) {
      console.error("Failed to resume recording:", error);
    }
  }, [state]);

  const stopRecording = useCallback(async () => {
    if ((state !== "recording" && state !== "paused") || !recordingRef.current) {
      return;
    }

    const recording = recordingRef.current;
    recordingRef.current = null;
    const imagesToUpload = [...pendingImagesRef.current];
    pendingImagesRef.current = [];

    setState("saving");

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (meteringIntervalRef.current) {
      clearInterval(meteringIntervalRef.current);
      meteringIntervalRef.current = null;
    }

    try {
      const status = await recording.getStatusAsync();
      const actualDuration = status.durationMillis ? status.durationMillis / 1000 : duration;

      if (status.canRecord) {
        await recording.stopAndUnloadAsync();
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const recordingId = id();
      const { filePath } = await saveRecordingLocally(
        recording,
        recordingId
      );

      await db.transact(
        db.tx.recordings[recordingId].update({
          localFilePath: filePath,
          duration: actualDuration,
          createdAt: Date.now(),
          status: "recorded",
          retryCount: 0,
        })
      );

      // Upload and link any pending images
      for (let i = 0; i < imagesToUpload.length; i++) {
        try {
          await uploadImageToStorage(imagesToUpload[i].localPath, recordingId, i);
        } catch (error) {
          console.error("Failed to upload image:", error);
        }
      }

      setDuration(0);
      setMetering(-160);
      setState("idle");

      onRecordingComplete?.();
    } catch (error) {
      console.error("Failed to save recording:", error);
      setDuration(0);
      setMetering(-160);
      setState("idle");
    }
  }, [state, onRecordingComplete]);

  const cancelRecording = useCallback(async () => {
    if (!recordingRef.current) {
      return;
    }

    pendingImagesRef.current = [];

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (meteringIntervalRef.current) {
      clearInterval(meteringIntervalRef.current);
      meteringIntervalRef.current = null;
    }

    try {
      await recordingRef.current.stopAndUnloadAsync();
    } catch {
      // Ignore errors when canceling
    }

    recordingRef.current = null;
    setDuration(0);
    setMetering(-160);
    setState("idle");
  }, []);

  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (meteringIntervalRef.current) {
        clearInterval(meteringIntervalRef.current);
      }
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  return {
    state,
    duration,
    hasPermission,
    metering,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    isRecording: state === "recording",
    isPaused: state === "paused",
    isSaving: state === "saving",
    isActive: state === "recording" || state === "paused",
  };
}
