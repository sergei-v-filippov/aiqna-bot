
import * as fs from 'fs/promises';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { v4 as uuid } from 'uuid';
import { VectorStore, DocumentPoint } from './vector-store';
import { getEmbeddingsBatch } from './embeddings';

 
export interface ProcessResult {
  filename:      string;
  chunksCount:   number;
  tokensEstimate: number;
  costEstimateUsd: number;
}
 
export class DocumentProcessor {
  private splitter: RecursiveCharacterTextSplitter;
  private vectorStore: VectorStore;
 
  constructor(vectorStore: VectorStore) {
    this.vectorStore = vectorStore;
 
    // RecursiveCharacterTextSplitter tries to split on paragraph boundaries first,
    // then sentence boundaries, then word boundaries — in that priority order.
    // 1500 characters ≈ 375 tokens. Overlap of 200 chars ≈ 50 tokens.
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize:    1500,
      chunkOverlap: 200,
      separators:   ['\n\n', '\n', '. ', ' ', ''],
    });
  }
 
  // Extract plain text from a PDF buffer.
  private async extractText(buffer: Buffer): Promise<string> {
    const data = await pdfParse(buffer);
    return data.text
      .replace(/\n{3,}/g, '\n\n')   // collapse excessive blank lines
      .replace(/[ \t]+/g, ' ')        // collapse horizontal whitespace
      .trim();
  }
 
  // Main entry point: takes a PDF buffer, chunks it, embeds it, and stores it.
  async processPdf(
    buffer: Buffer,
    filename: string,
    userId: string,
  ): Promise<ProcessResult> {
    const text   = await this.extractText(buffer);
    const chunks = await this.splitter.splitText(text);
 
    // Rough token estimate: 1 token ≈ 4 characters.
    // text-embedding-3-small costs $0.02 per 1M tokens.
    const tokensEstimate   = chunks.reduce((n, c) => n + Math.ceil(c.length / 4), 0);
    const costEstimateUsd  = (tokensEstimate / 1_000_000) * 0.02;
 
    const embeddings = await getEmbeddingsBatch(chunks);
 
    const points: DocumentPoint[] = chunks.map((chunk, index) => ({
      id: uuid(),
      vector: embeddings[index]!,
      payload: {
        text:        chunk,
        source:      filename,
        chunkIndex:  index,
        userId,
        uploadedAt:  new Date().toISOString(),
      },
    }));
 
    await this.vectorStore.upsert(points);
 
    return { filename, chunksCount: chunks.length, tokensEstimate, costEstimateUsd };
  }
}
