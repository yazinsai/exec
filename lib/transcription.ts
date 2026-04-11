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

  const formData = new FormData();

  if (typeof window !== "undefined" && typeof window.document !== "undefined") {
    // Web: fetch the file URI and convert to a real Blob
    const res = await fetch(localFilePath);
    const blob = await res.blob();
    const ext = localFilePath.match(/\.(\w+)$/)?.[1] ?? "webm";
    formData.append("file", blob, `recording.${ext}`);
  } else {
    // React Native: use the { uri, name, type } convention
    const file = {
      uri: localFilePath,
      name: "recording.m4a",
      type: "audio/x-m4a",
    } as unknown as Blob;
    formData.append("file", file);
  }
  formData.append("model", "whisper-1");
  formData.append("response_format", "text");

  // Add vocabulary prompt if provided
  if (prompt) {
    formData.append("prompt", prompt);
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const transcription = await response.text();
  return transcription.trim();
}
