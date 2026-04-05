/**
 * Offline recording queue.
 *
 * Persists pending recordings in AsyncStorage so they survive app restarts.
 * On startup, any queued entries are flushed into InstantDB.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_KEY = "exec_offline_recording_queue";

export interface QueuedRecording {
  noteId: string;
  filePath: string;
  createdAt: number;
}

export async function enqueueRecording(entry: QueuedRecording): Promise<void> {
  const queue = await getQueue();
  queue.push(entry);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueue(): Promise<QueuedRecording[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function removeFromQueue(noteId: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter((e) => e.noteId !== noteId);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
