import { AGENT_MAP } from "./agents.js";
import { runClaudeCode } from "./claude.js";
import { pressReleaseStore } from "./pressReleaseStore.js";
import { persistPressRelease } from "./supabasePersist.js";
import type { PressRelease } from "./types.js";

export async function generatePressRelease(
  placeholder: PressRelease,
): Promise<void> {
  if (!placeholder.topic || !placeholder.company) {
    throw new Error(
      "topic and company are required for press release generation",
    );
  }

  const prManager = AGENT_MAP.get("pr-manager");
  if (!prManager) {
    console.warn(
      "[pressRelease] pr-manager agent not found, using fallback prompt",
    );
  }
  const writer = AGENT_MAP.get("writer");

  const systemPrompt = `あなたは「伊藤 真理」、企業の広報マネージャーです。
${prManager?.systemPrompt ?? ""}
${writer ? `\nコンテンツライター（渡辺 光）と連携し、正確で説得力のある文章を書きます。` : ""}

以下のルールに従い、プロフェッショナルなプレスリリースを作成してください：
- 配信日、会社名、タイトル、本文（リード文・詳細・背景）、お問い合わせ先を含めること
- 客観的で事実に基づいたトーンを維持すること
- ブランドイメージを損なわない表現を選ぶこと
- プレスリリース本文のみを出力すること（前置きや説明は不要）`;

  const keyPointsList =
    placeholder.keyPoints.length > 0
      ? `\n主要ポイント:\n${placeholder.keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
      : "";

  const userPrompt = `以下の情報をもとにプレスリリースを作成してください。

発表トピック: ${placeholder.topic}
会社名: ${placeholder.company}${keyPointsList}

形式:
---
【プレスリリース】
配信日：〇〇〇〇年〇月〇日

【タイトル】
（タイトル）

【リード文】
（150字程度の要約）

【詳細】
（本文）

【背景・目的】
（背景説明）

【お問い合わせ】
${placeholder.company} 広報部
---`;

  try {
    const content = await runClaudeCode(systemPrompt, userPrompt);
    pressReleaseStore.update(placeholder.id, { content, status: "ready" });
    persistPressRelease({ ...placeholder, content, status: "ready" }).catch(
      () => {},
    );
  } catch {
    pressReleaseStore.update(placeholder.id, {
      content: "[ERROR] プレスリリースの生成に失敗しました",
      status: "ready",
    });
  }
}
