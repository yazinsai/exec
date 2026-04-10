const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Generate a short summary title from a voice transcription using OpenAI.
 * Returns null on failure so the caller can fall back to the raw input.
 */
export async function summarizeInput(input: string): Promise<string | null> {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages: [
          {
            role: "system",
            content:
              "Generate a short, descriptive title (max 60 chars) that captures the actual subject matter of the user's voice command. Focus on WHAT the command is about semantically — the topic, project, or goal — not HOW it's structured (e.g. never say 'two sequential tasks' or 'multi-step request'). Examples: 'Twitter morning paper pipeline', 'Fix auth middleware bug', 'Deploy landing page to production'. Return only the title, nothing else. No quotes.",
          },
          { role: "user", content: input },
        ],
        max_completion_tokens: 30,
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
