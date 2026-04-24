import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../lib/config';
 
export interface DocumentPoint {
  id: string;
  vector: number[];
  payload: {
    text: string;
    source: string;
    chunkIndex: number;
    userId: string;
    uploadedAt: string;
    [key: string]: unknown;
  };
}
 
export interface SearchResult {
  text: string;
  source: string;
  score: number;
  chunkIndex: number;
}
 
export class VectorStore {
  private client: QdrantClient;
  private collection: string;
  // gemini-embedding-001 produces 3072-dimensional vectors by default
  private readonly vectorSize = 3072;
 
  constructor() {
    this.client = new QdrantClient({ url: config.qdrant.url });
    this.collection = config.qdrant.collectionName;
  }
 
  // Create the collection if it does not exist yet.
  // Safe to call on every startup — idempotent.
  async ensureCollection(): Promise<void> {
    const { collections } = await this.client.getCollections();
    if (collections.some(c => c.name === this.collection)) return;
 
    await this.client.createCollection(this.collection, {
      vectors: { size: this.vectorSize, distance: 'Cosine' },
    });
    console.log(`Collection '${this.collection}' created`);
  }
 
  // Upsert a batch of points. Using upsert means re-indexing the same
  // document is safe — existing points are overwritten by ID.
  async upsert(points: DocumentPoint[]): Promise<void> {
    await this.client.upsert(this.collection, {
      wait: true,   // wait for indexing to complete before returning
      points: points.map(p => ({ id: p.id, vector: p.vector, payload: p.payload })),
    });
  }
 
  // Semantic search scoped to a single user.
  // The userId filter ensures users never see each other's documents.
  async search(vector: number[], userId: string, topK = 5): Promise<SearchResult[]> {
    const results = await this.client.search(this.collection, {
      vector,
      limit: topK,
      filter: { must: [{ key: 'userId', match: { value: userId } }] },
      with_payload: true,
      score_threshold: 0.5,  // discard clearly irrelevant chunks
    });
 
    return results.map(r => ({
      text:       r.payload?.text       as string,
      source:     r.payload?.source     as string,
      score:      r.score,
      chunkIndex: r.payload?.chunkIndex as number,
    }));
  }
 
  // Remove all documents belonging to a user.
  // Called when the user issues /clear.
  async deleteByUser(userId: string): Promise<void> {
    await this.client.delete(this.collection, {
      filter: { must: [{ key: 'userId', match: { value: userId } }] },
    });
  }
 
  async getStats(): Promise<{ pointsCount: number }> {
    const info = await this.client.getCollection(this.collection);
    return { pointsCount: info.points_count ?? 0 };
  }
}
