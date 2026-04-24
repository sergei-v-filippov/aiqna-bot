import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../lib/config';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

// Embed одну строку
export async function getEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: config.gemini.embeddingModel });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

// Embed несколько строк батчем
// Gemini embedContent не поддерживает батч напрямую как OpenAI,
// поэтому делаем параллельные запросы
export async function getEmbeddingsBatch(
  texts: string[],
  batchSize = 20,
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    // Параллельно в рамках батча
    const batchResults = await Promise.all(batch.map(text => getEmbedding(text)));
    results.push(...batchResults);
    console.log(`Embedded ${Math.min(i + batchSize, texts.length)}/${texts.length} chunks`);
  }

  return results;
}