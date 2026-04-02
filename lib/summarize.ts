const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Generate a short summary title from a voice transcription using Groq LLM.
 * Returns null on failure so the caller can fall back to the raw input.
 */
export async function summarizeInput(input: string): Promise<string | null> {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Summarize the user's voice command into a short title (max 60 chars). Be concise and specific. Return only the title, nothing else. No quotes.",
          },
          { role: "user", content: input },
        ],
        max_tokens: 30,
        temperature: 0,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim();
    return summary || null;
  } catch {
    return null;
  }
}
