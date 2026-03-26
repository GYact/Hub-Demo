import { AGENT_MAP } from "./agents.js";
import { runClaudeCode } from "./claude.js";
import { postStore } from "./postStore.js";
import { persistPost } from "./supabasePersist.js";
import type { GeneratedPost, Platform } from "./types.js";

const PLATFORM_PROMPTS: Record<Platform, string> = {
  x: `X（旧Twitter）向けの投稿文を1つ作成してください。
- 140文字以内に収めること
- ハッシュタグを2-3個付けること
- 絵文字を適度に使うこと
- エンゲージメントを意識した表現にすること
- 投稿文のみを出力すること（説明や前置きは不要）`,

  note: `Note向けの記事イントロ文を作成してください。
- 300-500文字程度
- 読者の興味を引く導入文
- 専門的だが分かりやすい文体
- 続きを読みたくなる構成
- 本文のみを出力すること（説明や前置きは不要）`,

  general: `汎用的なSNS投稿文を作成してください。
- 200文字程度
- どのプラットフォームでも使える汎用的な内容
- プロフェッショナルかつ親しみやすい文体
- 本文のみを出力すること（説明や前置きは不要）`,

  instagram: `Instagram向けのキャプションを作成してください。
- 150-300文字程度
- ビジュアルを想起させる描写的な文章
- ブランドの世界観を表現すること
- ハッシュタグを5-10個、本文の後に改行して付けること
- 絵文字を効果的に使うこと
- キャプション本文のみを出力すること（説明や前置きは不要）`,

  tiktok: `TikTok向けの動画説明文・フックを作成してください。
- 冒頭1文は視聴者が止まるような強いフック（最重要）
- 全体100文字程度
- Z世代に響くカジュアルなトーン
- 「〇〇してみた」「これ知ってた？」など行動促進の表現
- ハッシュタグを3-5個付けること（#fyp #fypシ 系も含める）
- 本文のみを出力すること（説明や前置きは不要）`,
};

export async function generatePosts(
  topic: string,
  placeholders: GeneratedPost[],
): Promise<void> {
  const snsAgent = AGENT_MAP.get("sns");
  if (!snsAgent) {
    console.warn("[postGenerator] sns agent not found, using fallback prompt");
  }
  const writerAgent = AGENT_MAP.get("writer");

  const systemPrompt = `あなたはSNSマーケティングの専門家です。
${snsAgent?.systemPrompt ?? ""}
${writerAgent ? `\nコンテンツライターの視点も持ち合わせています。` : ""}

与えられたトピックに対して、指定されたプラットフォーム向けの投稿文を作成してください。
企業の公式アカウントとして適切なトーンで書いてください。`;

  await Promise.all(
    placeholders.map(async (placeholder) => {
      const platformPrompt = PLATFORM_PROMPTS[placeholder.platform];
      const userPrompt = `トピック: ${topic}\n\n${platformPrompt}`;

      try {
        const result = await runClaudeCode(systemPrompt, userPrompt);
        postStore.updatePost(placeholder.id, {
          content: result,
          status: "ready",
        });
        persistPost({ ...placeholder, content: result, status: "ready" }).catch(
          () => {},
        );
      } catch {
        postStore.updatePost(placeholder.id, {
          content: "[ERROR] 生成に失敗しました",
          status: "ready",
        });
      }
    }),
  );
}
