import { Platform } from "react-native";
import {
  uploadAsync,
  FileSystemUploadType,
} from "expo-file-system/legacy";

const OPENAI_API_URL = "https://api.openai.com/v1/audio/transcriptions";
const MAX_PROMPT_CHARS = 800; // ~200 tokens, safe under 224-token limit

export type DictionaryTerm = { term: string };

export function buildDictionaryPrompt(terms: DictionaryTerm[]): string {
  const parts: string[] = [];
  let len = 0;
  for (const t of terms) {
    const addition = t.term.length + (parts.length > 0 ? 2 : 0); // ", " separator
    if (len + addition > MAX_PROMPT_CHARS) break;
    parts.push(t.term);
    len += addition;
  }
  return parts.join(", ");
}

/**
 * Transcribe audio using OpenAI's Whisper API.
 * @param localFilePath - Path to the audio file
 * @param prompt - Optional prompt to guide transcription spelling (max 224 tokens)
 */
export async function transcribeAudio(localFilePath: string, prompt?: string): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const ext = localFilePath.match(/\.(\w+)$/)?.[1] ?? "m4a";

  if (Platform.OS === "web") {
    const formData = new FormData();
    const res = await fetch(localFilePath);
    const blob = await res.blob();
    formData.append("file", blob, `recording.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("response_format", "text");
    if (prompt) formData.append("prompt", prompt);

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }
    return (await response.text()).trim();
  }

  // Native (iOS/Android): use expo-file-system uploadAsync for reliable multipart
  const parameters: Record<string, string> = {
    model: "whisper-1",
    response_format: "text",
  };
  if (prompt) parameters.prompt = prompt;

  const response = await uploadAsync(OPENAI_API_URL, localFilePath, {
    httpMethod: "POST",
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType: ext === "m4a" ? "audio/m4a" : `audio/${ext}`,
    parameters,
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`OpenAI API error: ${response.status} - ${response.body}`);
  }
  return response.body.trim();
}
