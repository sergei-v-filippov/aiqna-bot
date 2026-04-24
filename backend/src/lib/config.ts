import * as dotenv from 'dotenv';
dotenv.config();
 
function env(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}
 
export const config = {
  openai: {
    apiKey: env('OPENAI_API_KEY'),
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-004',
    chatModel: process.env.OPENAI_CHAT_MODEL ?? 'gemini-1.5-flash',
  },
  gemini: {
    apiKey:         env('GOOGLE_API_KEY'),
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001',
    chatModel:      process.env.GEMINI_CHAT_MODEL      ?? 'gemini-2.5-flash-lite',
  },
  telegram: {
    token: env('TELEGRAM_BOT_TOKEN'),
    webhookUrl: process.env.WEBHOOK_URL,
  },
  qdrant: {
    url:            process.env.QDRANT_URL       ?? 'http://localhost:6333',
    collectionName: process.env.QDRANT_COLLECTION ?? 'aiqna-documents',
  },
  env: process.env.NODE_ENV ?? 'development',
} as const;
