import { randomUUID } from "node:crypto";
import type { GeneratedPost, Platform } from "./types.js";

export const PLATFORM_LABELS: Record<Platform, string> = {
  x: "X (Twitter)",
  note: "Note",
  general: "汎用",
  instagram: "Instagram",
  tiktok: "TikTok",
};

class PostStore {
  private posts: GeneratedPost[] = [];

  addPost(post: Omit<GeneratedPost, "id" | "timestamp">): GeneratedPost {
    const full: GeneratedPost = {
      ...post,
      id: randomUUID(),
      timestamp: Date.now(),
    };
    this.posts.unshift(full);
    if (this.posts.length > 100) {
      this.posts = this.posts.slice(0, 80);
    }
    return full;
  }

  getPost(id: string): GeneratedPost | undefined {
    return this.posts.find((p) => p.id === id);
  }

  updatePost(id: string, updates: Partial<GeneratedPost>): void {
    const post = this.posts.find((p) => p.id === id);
    if (post) Object.assign(post, updates);
  }

  getPosts(): GeneratedPost[] {
    return [...this.posts];
  }

  deletePost(id: string): void {
    this.posts = this.posts.filter((p) => p.id !== id);
  }

  reset(): void {
    this.posts = [];
  }
}

export const postStore = new PostStore();
