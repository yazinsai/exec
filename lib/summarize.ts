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
              "You are a title generator. Given a voice transcript, output a single short title (max 60 chars) that names the specific project, tool, or topic and the action being taken.\n\nRules:\n- Name the actual thing: the project, app, API, language, or domain\n- Include the verb: fix, add, build, research, deploy, update\n- NEVER describe the structure of the request (e.g. 'one concrete task', 'two sequential tasks', 'multi-step request', 'three tasks extracted')\n- NEVER use vague words like 'concrete', 'various', 'multiple', 'several'\n- If multiple topics, pick the most important one\n\nExamples:\n- 'Fix exec app cancel bug' not 'One bug fix task'\n- 'Bahrain solar feasibility research' not 'Three research tasks'\n- 'Add TTS to exec messages' not 'One concrete feature request'\n\nReturn ONLY the title. No quotes, no explanation.",
          },
          { role: "user", content: input },
        ],
        max_completion_tokens: 40,
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
