import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { refreshAccessToken } from "../_shared/googleAuth.ts";
import {
  resolveFolderPath,
  uploadFileToDrive,
} from "../_shared/googleDrive.ts";
import {
  buildAgendaPdf,
  type AgendaData,
} from "../_shared/agendaPdfBuilder.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const DRIVE_MEETINGS_PATH = "99_Meetings";

// ---------- Types ----------

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: {
    email: string;
    displayName?: string;
    responseStatus?: string;
  }[];
  recurrence?: string[];
  recurringEventId?: string;
  organizer?: { email: string; displayName?: string };
}

interface RequestBody {
  userId: string;
  googleEmail: string;
  calendarId?: string;
  eventId: string;
  /** ISO date string for the specific occurrence */
  eventDate?: string;
}

// ---------- Helpers ----------

async function fetchCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<CalendarEvent> {
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Calendar API error (${res.status}): ${err}`);
  }
  return await res.json();
}

async function fetchRelatedEmails(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  keywords: string[],
  limit = 10,
): Promise<
  { subject: string; sender: string; body_text: string; date: string }[]
> {
  if (keywords.length === 0) return [];

  // Search emails matching any keyword in subject or body
  const orFilter = keywords
    .map((k) => `subject.ilike.%${k}%,body_text.ilike.%${k}%`)
    .join(",");

  const { data } = await supabase
    .from("google_gmail_messages")
    .select("subject, sender, body_text, date")
    .eq("user_id", userId)
    .or(orFilter)
    .order("date", { ascending: false })
    .limit(limit);

  return (data ?? []).map((m: Record<string, unknown>) => ({
    subject: (m.subject as string) ?? "",
    sender: (m.sender as string) ?? "",
    body_text: ((m.body_text as string) ?? "").slice(0, 500),
    date: (m.date as string) ?? "",
  }));
}

async function fetchRelatedProjects(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  keywords: string[],
): Promise<{ name: string; description: string; status: string }[]> {
  if (keywords.length === 0) return [];

  const orFilter = keywords
    .map((k) => `name.ilike.%${k}%,description.ilike.%${k}%`)
    .join(",");

  const { data } = await supabase
    .from("projects")
    .select("name, description, status")
    .eq("user_id", userId)
    .in("status", ["planning", "in_progress", "on_hold"])
    .or(orFilter)
    .limit(10);

  return (data ?? []).map((p: Record<string, unknown>) => ({
    name: (p.name as string) ?? "",
    description: (p.description as string) ?? "",
    status: (p.status as string) ?? "",
  }));
}

async function fetchActiveProjects(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ name: string; description: string; status: string }[]> {
  const { data } = await supabase
    .from("projects")
    .select("name, description, status")
    .eq("user_id", userId)
    .in("status", ["planning", "in_progress", "on_hold"])
    .limit(15);

  return (data ?? []).map((p: Record<string, unknown>) => ({
    name: (p.name as string) ?? "",
    description: (p.description as string) ?? "",
    status: (p.status as string) ?? "",
  }));
}

async function generateAgendaContent(
  event: CalendarEvent,
  projects: { name: string; description: string; status: string }[],
  emails: {
    subject: string;
    sender: string;
    body_text: string;
    date: string;
  }[],
  eventDate?: string,
): Promise<AgendaData> {
  const attendeeList = (event.attendees ?? []).map(
    (a) => a.displayName || a.email,
  );
  const organizerName =
    event.organizer?.displayName || event.organizer?.email || "Organizer";

  const startDt = event.start.dateTime || event.start.date || "";
  const endDt = event.end.dateTime || event.end.date || "";
  const meetingDate = eventDate || startDt.slice(0, 10);

  // Build start/end times
  let timeStr = "";
  if (event.start.dateTime) {
    const s = new Date(event.start.dateTime);
    const e = new Date(event.end.dateTime || event.start.dateTime);
    timeStr = `${s.getHours().toString().padStart(2, "0")}:${s.getMinutes().toString().padStart(2, "0")} - ${e.getHours().toString().padStart(2, "0")}:${e.getMinutes().toString().padStart(2, "0")}`;
  }

  const projectSummary = projects
    .map(
      (p) =>
        `- ${p.name} (${p.status}): ${(p.description || "").slice(0, 200)}`,
    )
    .join("\n");

  const emailSummary = emails
    .map(
      (e) =>
        `- [${e.date?.slice(0, 10) ?? ""}] ${e.subject} (from: ${e.sender}): ${e.body_text.slice(0, 200)}`,
    )
    .join("\n");

  const prompt = `You are a professional meeting agenda generator.
Based on the meeting details and context below, generate a structured meeting agenda in JSON format.

Meeting Title: ${event.summary}
Description: ${event.description || "N/A"}
Date: ${meetingDate}
Time: ${timeStr}
Location: ${event.location || "Online"}
Organizer: ${organizerName}
Attendees: ${attendeeList.join(", ")}
Is Recurring: ${event.recurrence ? "Yes" : event.recurringEventId ? "Yes (instance)" : "No"}

Related Active Projects:
${projectSummary || "None found"}

Recent Related Emails:
${emailSummary || "None found"}

Generate a meeting agenda that:
1. Has 3-6 agenda items with realistic time allocations
2. References relevant projects and email topics as discussion points
3. Includes practical action items
4. Uses Japanese for section headers if the meeting title contains Japanese, otherwise use English

Return ONLY valid JSON matching this structure:
{
  "meetingTitle": "string",
  "date": "YYYY-MM-DD",
  "time": "HH:MM - HH:MM",
  "location": "string",
  "organizer": "string",
  "attendees": ["string"],
  "objective": "Brief meeting objective",
  "agendaItems": [
    {
      "title": "string",
      "duration": "X min",
      "description": "Brief description",
      "presenter": "Person name or null"
    }
  ],
  "referenceNotes": ["string - key reference items"],
  "actionItems": ["string - action items to track"]
}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const parsed = JSON.parse(text) as AgendaData;

  // Ensure all required fields have defaults
  return {
    meetingTitle: parsed.meetingTitle || event.summary,
    date: parsed.date || meetingDate,
    time: parsed.time || timeStr,
    location: parsed.location || event.location || "Online",
    organizer: parsed.organizer || organizerName,
    attendees: parsed.attendees?.length
      ? parsed.attendees
      : attendeeList.length
        ? attendeeList
        : [organizerName],
    objective: parsed.objective || "",
    agendaItems: parsed.agendaItems?.length
      ? parsed.agendaItems
      : [
          {
            title: "Opening / Status Update",
            duration: "5 min",
            description: "Review previous action items",
          },
          {
            title: "Main Discussion",
            duration: "20 min",
            description: event.description || "Agenda items",
          },
          {
            title: "Next Steps",
            duration: "5 min",
            description: "Assign action items",
          },
        ],
    referenceNotes: parsed.referenceNotes ?? [],
    actionItems: parsed.actionItems ?? [],
  };
}

// ---------- Main Handler ----------

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase configuration" }, 500);
  }
  if (!geminiApiKey) {
    return jsonResponse({ error: "Missing GEMINI_API_KEY" }, 500);
  }

  try {
    const body = (await req.json()) as RequestBody;
    const { userId, googleEmail, eventId, eventDate } = body;
    const calendarId = body.calendarId || "primary";

    if (!userId || !googleEmail || !eventId) {
      return jsonResponse(
        { error: "userId, googleEmail, and eventId are required" },
        400,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get access token
    const accessToken = await refreshAccessToken(supabase, userId, googleEmail);
    if (!accessToken) {
      return jsonResponse({ error: "Failed to obtain access token" }, 401);
    }

    // Fetch calendar event
    const event = await fetchCalendarEvent(accessToken, calendarId, eventId);

    // Extract keywords from event title for related data search
    const titleWords = (event.summary || "")
      .replace(/[^\w\s\u3000-\u9FFF]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);

    // Fetch related context in parallel
    const [relatedProjects, relatedEmails, activeProjects] = await Promise.all([
      fetchRelatedProjects(supabase, userId, titleWords.slice(0, 5)),
      fetchRelatedEmails(supabase, userId, titleWords.slice(0, 5)),
      fetchActiveProjects(supabase, userId),
    ]);

    // Merge related + active projects (deduplicate by name)
    const seenNames = new Set(relatedProjects.map((p) => p.name));
    const allProjects = [
      ...relatedProjects,
      ...activeProjects.filter((p) => !seenNames.has(p.name)),
    ];

    // Generate agenda content via Gemini
    const agendaData = await generateAgendaContent(
      event,
      allProjects,
      relatedEmails,
      eventDate,
    );

    // Build PDF
    const pdfBytes = await buildAgendaPdf(agendaData);

    // Upload to Google Drive
    const dateStr = agendaData.date.replace(/-/g, "");
    const safeName = (event.summary || "Meeting")
      .replace(/[/\\:*?"<>|]/g, "_")
      .slice(0, 50);
    const fileName = `Agenda_${safeName}_${dateStr}.pdf`;
    const driveFolderPath = `${DRIVE_MEETINGS_PATH}/${safeName}`;

    const folderId = await resolveFolderPath(accessToken, driveFolderPath);
    const driveFileId = await uploadFileToDrive(
      accessToken,
      folderId,
      fileName,
      "application/pdf",
      pdfBytes,
    );

    console.log(
      `[generate_agenda] Generated agenda for "${event.summary}" → Drive file ${driveFileId}`,
    );

    return jsonResponse({
      success: true,
      driveFileId,
      fileName,
      driveFolderPath,
      agendaData,
    });
  } catch (err) {
    console.error("[generate_agenda] Error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});
