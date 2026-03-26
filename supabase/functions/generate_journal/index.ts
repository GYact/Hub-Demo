import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logApiUsage, estimateTokensFromText } from "../_shared/costTracker.ts";

// ── Types ──────────────────────────────────────────────────

type PhotoInput = {
  url: string;
  description?: string;
  taken_at?: string;
};

type LocationInput = {
  name: string;
  lat?: number;
  lng?: number;
  visited_at?: string;
};

type CalendarEvent = {
  summary: string;
  start_time: string;
  end_time: string;
  location?: string;
  description?: string;
  attendee_count?: number;
};

type TaskItem = {
  title: string;
  completed: boolean;
  due_time?: string;
  notes?: string;
};

type JournalGenerated = {
  title: string;
  content: string;
  mood: "happy" | "good" | "neutral" | "sad" | "stressed";
};

type RequestBody = {
  date: string; // YYYY-MM-DD
  photos?: PhotoInput[];
  locations?: LocationInput[];
  model?: "gemini" | "openai" | "anthropic";
};

// ── Environment ────────────────────────────────────────────

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

// ── LLM Calls ──────────────────────────────────────────────

const callGeminiJson = async (
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
): Promise<string> => {
  if (!geminiApiKey) throw new Error("Gemini API key not configured");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n${userMessage}` }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: maxTokens,
          responseMimeType: "application/json",
        },
      }),
    },
  );
  if (!response.ok)
    throw new Error(`Gemini API error: ${await response.text()}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
};

const callOpenAIJson = async (
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
): Promise<string> => {
  if (!openaiApiKey) throw new Error("OpenAI API key not configured");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok)
    throw new Error(`OpenAI API error: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "{}";
};

const callAnthropicJson = async (
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
): Promise<string> => {
  if (!anthropicApiKey) throw new Error("Anthropic API key not configured");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      system: systemPrompt,
      max_tokens: maxTokens,
      temperature: 0.7,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!response.ok)
    throw new Error(`Anthropic API error: ${await response.text()}`);
  const data = await response.json();
  return data.content?.[0]?.text || "{}";
};

const callLlm = async (
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 2048,
): Promise<string> => {
  if (model === "anthropic")
    return callAnthropicJson(systemPrompt, userMessage, maxTokens);
  if (model === "openai")
    return callOpenAIJson(systemPrompt, userMessage, maxTokens);
  return callGeminiJson(systemPrompt, userMessage, maxTokens);
};

// ── Data Collection ────────────────────────────────────────

const collectCalendarEvents = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  date: string,
): Promise<CalendarEvent[]> => {
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;

  const { data } = await supabaseAdmin
    .from("google_calendar_events")
    .select("summary, start_time, end_time, location, description, attendees")
    .eq("user_id", userId)
    .gte("start_time", dayStart)
    .lte("start_time", dayEnd)
    .neq("status", "cancelled")
    .order("start_time")
    .limit(30);

  return (data ?? []).map((e: Record<string, unknown>) => ({
    summary: (e.summary as string) || "No title",
    start_time: e.start_time as string,
    end_time: e.end_time as string,
    location: (e.location as string) || undefined,
    description: e.description
      ? (e.description as string).slice(0, 200)
      : undefined,
    attendee_count: Array.isArray(e.attendees) ? e.attendees.length : 0,
  }));
};

const collectTasks = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  date: string,
): Promise<TaskItem[]> => {
  const { data } = await supabaseAdmin
    .from("tasks")
    .select("title, completed, due_time, notes")
    .eq("user_id", userId)
    .eq("due_date", date)
    .order("completed")
    .limit(30);

  return (data ?? []).map((t: Record<string, unknown>) => ({
    title: (t.title as string) || "",
    completed: (t.completed as boolean) ?? false,
    due_time: (t.due_time as string) || undefined,
    notes: t.notes ? (t.notes as string).slice(0, 100) : undefined,
  }));
};

const collectLocationLogs = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  date: string,
): Promise<LocationInput[]> => {
  const dayStart = `${date}T00:00:00+09:00`;
  const dayEnd = `${date}T23:59:59+09:00`;

  const { data } = await supabaseAdmin
    .from("location_logs")
    .select("name, lat, lng, logged_at")
    .eq("user_id", userId)
    .gte("logged_at", dayStart)
    .lte("logged_at", dayEnd)
    .order("logged_at")
    .limit(50);

  return (data ?? [])
    .filter((l: Record<string, unknown>) => l.name)
    .map((l: Record<string, unknown>) => ({
      name: l.name as string,
      lat: l.lat as number,
      lng: l.lng as number,
      visited_at: (l.logged_at as string).slice(11, 16),
    }));
};

// ── Prompt Building ────────────────────────────────────────

const buildSystemPrompt = (): string => `
あなたは個人のジャーナル（日記）ライターです。
ユーザーの1日の予定、タスク、訪れた場所、撮った写真の情報を元に、
その日を振り返る温かみのある日記エントリーを生成してください。

ルール:
- 日本語で書いてください
- 一人称は「自分」や主語省略を使い、自然な日記調で書いてください
- タイトルは15文字以内で、その日を象徴する一言にしてください
- 本文は200-500文字程度で、箇条書きではなく文章として書いてください
- 予定がない時間帯は想像で埋めず、あるデータだけから書いてください
- 写真があれば、その情景を文中に織り込んでください
- 位置情報があれば、場所の移動や訪問を自然に言及してください
- moodは1日全体の雰囲気から判断してください

以下のJSON形式で回答してください:
{
  "title": "タイトル",
  "content": "本文",
  "mood": "happy|good|neutral|sad|stressed"
}
`;

const buildUserMessage = (
  date: string,
  events: CalendarEvent[],
  tasks: TaskItem[],
  photos: PhotoInput[],
  locations: LocationInput[],
): string => {
  const parts: string[] = [`日付: ${date}`];

  if (events.length > 0) {
    parts.push("\n## 予定:");
    for (const e of events) {
      const time = `${e.start_time.slice(11, 16)}-${e.end_time.slice(11, 16)}`;
      let line = `- ${time} ${e.summary}`;
      if (e.location) line += ` @${e.location}`;
      if (e.attendee_count && e.attendee_count > 0)
        line += ` (${e.attendee_count}人)`;
      if (e.description) line += `\n  概要: ${e.description}`;
      parts.push(line);
    }
  }

  if (tasks.length > 0) {
    parts.push("\n## タスク:");
    for (const t of tasks) {
      const status = t.completed ? "✅" : "⬜";
      let line = `- ${status} ${t.title}`;
      if (t.due_time) line += ` (${t.due_time})`;
      parts.push(line);
    }
  }

  if (locations.length > 0) {
    parts.push("\n## 訪れた場所:");
    for (const loc of locations) {
      let line = `- ${loc.name}`;
      if (loc.visited_at) line += ` (${loc.visited_at})`;
      parts.push(line);
    }
  }

  if (photos.length > 0) {
    parts.push("\n## 写真:");
    for (const photo of photos) {
      let line = `- ${photo.description || "写真"}`;
      if (photo.taken_at) line += ` (${photo.taken_at})`;
      parts.push(line);
    }
  }

  if (
    events.length === 0 &&
    tasks.length === 0 &&
    locations.length === 0 &&
    photos.length === 0
  ) {
    parts.push(
      "\n特に記録されたデータはありませんが、穏やかな一日だったようです。シンプルな振り返りを書いてください。",
    );
  }

  return parts.join("\n");
};

// ── Main Handler ───────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader)
      return jsonResponse({ error: "Missing authorization" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const supabaseUser = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await supabaseUser.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body: RequestBody = await req.json();
    const { date, photos = [], locations = [], model = "gemini" } = body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonResponse(
        { error: "Invalid date format. Use YYYY-MM-DD" },
        400,
      );
    }

    // Collect data
    const [events, tasks, gpsLocations] = await Promise.all([
      collectCalendarEvents(supabaseAdmin, user.id, date),
      collectTasks(supabaseAdmin, user.id, date),
      collectLocationLogs(supabaseAdmin, user.id, date),
    ]);

    // Merge: client-provided > GPS logs > calendar event locations
    const calendarLocations: LocationInput[] = events
      .filter((e) => e.location)
      .map((e) => ({
        name: e.location!,
        visited_at: e.start_time.slice(11, 16),
      }));

    const allLocations = [...locations, ...gpsLocations, ...calendarLocations];

    // Build prompt and call LLM
    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(
      date,
      events,
      tasks,
      photos,
      allLocations,
    );

    const rawResponse = await callLlm(model, systemPrompt, userMessage);

    // Log cost (fire-and-forget)
    const providerName =
      model === "anthropic"
        ? "anthropic"
        : model === "openai"
          ? "openai"
          : "gemini";
    logApiUsage(
      supabaseAdmin,
      providerName,
      model,
      "generate_journal",
      estimateTokensFromText(systemPrompt + userMessage),
      estimateTokensFromText(rawResponse),
    ).catch(() => {});

    // Parse response
    let generated: JournalGenerated;
    try {
      const parsed = JSON.parse(rawResponse);
      generated = {
        title: parsed.title || "",
        content: parsed.content || "",
        mood: ["happy", "good", "neutral", "sad", "stressed"].includes(
          parsed.mood,
        )
          ? parsed.mood
          : "neutral",
      };
    } catch {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        generated = {
          title: parsed.title || "",
          content: parsed.content || "",
          mood: ["happy", "good", "neutral", "sad", "stressed"].includes(
            parsed.mood,
          )
            ? parsed.mood
            : "neutral",
        };
      } else {
        throw new Error("Failed to parse LLM response");
      }
    }

    // Save to database
    const entryId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error: insertError } = await supabaseAdmin
      .from("journal_entries")
      .insert({
        id: entryId,
        user_id: user.id,
        entry_date: date,
        title: generated.title,
        content: generated.content,
        mood: generated.mood,
        tags: ["auto-journal"],
        photos: photos.length > 0 ? photos : [],
        location_log: allLocations.length > 0 ? allLocations : [],
        auto_generated: true,
        created_at: now,
        updated_at: now,
      });

    if (insertError) throw insertError;

    return jsonResponse({
      id: entryId,
      entry_date: date,
      title: generated.title,
      content: generated.content,
      mood: generated.mood,
      photos,
      location_log: allLocations,
      auto_generated: true,
      events_count: events.length,
      tasks_count: tasks.length,
    });
  } catch (error) {
    console.error("generate_journal error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
    );
  }
});
