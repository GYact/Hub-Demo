import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MEAL_PROMPT = `You are an expert nutritionist AI analyzing a food/meal photo.
Analyze the image and estimate nutritional information as accurately as possible.
Return ONLY valid JSON with this structure:
{
  "calories": <estimated total kcal as number>,
  "protein_g": <protein in grams>,
  "carbs_g": <carbohydrates in grams>,
  "fat_g": <fat in grams>,
  "fiber_g": <fiber in grams>,
  "nutrients": {
    "vitamin_a_ug": <number or null>,
    "vitamin_c_mg": <number or null>,
    "vitamin_d_ug": <number or null>,
    "vitamin_b12_ug": <number or null>,
    "calcium_mg": <number or null>,
    "iron_mg": <number or null>,
    "zinc_mg": <number or null>,
    "magnesium_mg": <number or null>,
    "potassium_mg": <number or null>,
    "sodium_mg": <number or null>,
    "omega3_mg": <number or null>,
    "folate_ug": <number or null>
  },
  "items": [{"name": "<food item name>", "amount_g": <estimated grams>, "calories": <kcal>}],
  "meal_description": "<brief description of the meal>"
}
If the image is in Japanese context, item names can be in Japanese.
Estimate amounts based on typical serving sizes visible in the photo.
Return ONLY valid JSON, no markdown fences or extra text.`;

const SUPPLEMENT_PROMPT = `You are an expert OCR system specialized in reading supplement/vitamin labels and nutritional facts panels.
Carefully read ALL text visible on the packaging, label, and nutritional facts table.
Extract every nutrient, ingredient, and dosage information printed on the label.

Return ONLY valid JSON with this structure:
{
  "name": "<product name exactly as printed>",
  "brand": "<brand/manufacturer name>",
  "dosage": "<serving size and recommended intake, e.g. '1日3粒', '1 tablet daily'>",
  "nutrients": {
    "<nutrient_name>": "<amount with unit exactly as printed, e.g. 'ビタミンD 25μg', '500mg', '1000IU'>"
  },
  "ingredients": "<full ingredients list as printed>",
  "warnings": "<any warnings or cautions>",
  "rawText": "<ALL readable text from the image, preserving layout>"
}

IMPORTANT:
- Read the 栄養成分表示 (Nutrition Facts) table carefully — extract every single row.
- For Japanese labels: keep original Japanese text for names, translate units if needed.
- Include ALL nutrients listed: vitamins, minerals, amino acids, herbal extracts, etc.
- The "nutrients" object should have one key per nutrient line on the label.
- Use standardized keys where possible: vitamin_a, vitamin_b1, vitamin_b2, vitamin_b6, vitamin_b12, vitamin_c, vitamin_d, vitamin_e, vitamin_k, calcium, iron, zinc, magnesium, folate, biotin, niacin, pantothenic_acid, omega3, dha, epa, coq10, etc.
- Keep the original amount string with unit as the value.
Return ONLY valid JSON, no markdown fences or extra text.`;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase configuration" }, 500);
  }
  if (!geminiApiKey) {
    return jsonResponse({ error: "Missing Gemini API key" }, 500);
  }

  // Authenticate user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing authorization" }, 401);
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Parse request body
  let body: {
    base64Data: string;
    mimeType: string;
    type: "meal" | "supplement";
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { base64Data, mimeType, type } = body;
  if (!base64Data || !mimeType || !type) {
    return jsonResponse(
      { error: "base64Data, mimeType, and type are required" },
      400,
    );
  }

  const prompt = type === "meal" ? MEAL_PROMPT : SUPPLEMENT_PROMPT;

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errText);
      return jsonResponse({ error: "AI analysis failed" }, 502);
    }

    const geminiData = await geminiResponse.json();
    const textContent =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(textContent);
    } catch {
      result = { rawText: textContent };
    }

    return jsonResponse({ type, result });
  } catch (err) {
    console.error("Health AI error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
