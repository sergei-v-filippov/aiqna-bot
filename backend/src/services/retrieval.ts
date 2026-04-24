// import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
// import { QdrantVectorStore } from '@langchain/qdrant';
// import { ChatPromptTemplate } from '@langchain/core/prompts';
// import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
// import { StringOutputParser } from '@langchain/core/output_parsers';
// import { Document } from '@langchain/core/documents';
// import { config } from '../lib/config';

// const SYSTEM_PROMPT = `You are an AI assistant that answers questions about the user's uploaded documents.
// Answer ONLY based on the context provided below.
// After each key statement cite the source in the format [filename].
// If the answer is not present in the context, respond with:
// 'This information was not found in your documents.'
// Do not add information from your own knowledge.
// Reply in the same language as the question.

// Context:
// {context}`;

// export class RetrievalService {
//   private vectorStore: QdrantVectorStore;
//   private llm: ChatGoogleGenerativeAI;
//   private embeddings: GoogleGenerativeAIEmbeddings;

//   constructor() {
//     this.embeddings = new GoogleGenerativeAIEmbeddings({
//       model:   config.gemini.embeddingModel,
//       apiKey:  config.gemini.apiKey,
//     });
//     this.llm = new ChatGoogleGenerativeAI({
//       model:       config.gemini.chatModel,
//       temperature: 0.1,
//       apiKey:      config.gemini.apiKey,
//     });
//     this.vectorStore = new QdrantVectorStore(this.embeddings, {
//       url:            config.qdrant.url,
//       collectionName: config.qdrant.collectionName,
//     });
//   }

//   private getRetriever(userId: string) {
//     return this.vectorStore.asRetriever({
//       k: 5,
//       filter: { must: [{ key: 'userId', match: { value: userId } }] },
//     });
//   }

//   private formatDocs(docs: Document[]): string {
//     return docs
//       .map(d => `[${d.metadata.source}]:\n${d.pageContent}`)
//       .join('\n\n---\n\n');
//   }

//   async query(question: string, userId: string): Promise<string> {
//     const retriever = this.getRetriever(userId);
//     const prompt = ChatPromptTemplate.fromMessages([
//       ['system', SYSTEM_PROMPT],
//       ['human', '{question}'],
//     ]);

//     const chain = RunnableSequence.from([
//       { context: retriever.pipe(docs => this.formatDocs(docs)),
//         question: new RunnablePassthrough() },
//       prompt,
//       this.llm,
//       new StringOutputParser(),
//     ]);

//     return chain.invoke(question);
//   }

//   async *queryStream(question: string, userId: string): AsyncGenerator<string> {
//     const retriever = this.getRetriever(userId);
//     const prompt = ChatPromptTemplate.fromMessages([
//       ['system', SYSTEM_PROMPT],
//       ['human', '{question}'],
//     ]);

//     const chain = RunnableSequence.from([
//       { context: retriever.pipe(docs => this.formatDocs(docs)),
//         question: new RunnablePassthrough() },
//       prompt,
//       this.llm,
//       new StringOutputParser(),
//     ]);

//     for await (const chunk of await chain.stream(question)) {
//       yield chunk;
//     }
//   }
// }

import { GoogleGenerativeAI } from '@google/generative-ai';
import { Document } from '@langchain/core/documents';
import { config } from '../lib/config';
import { getEmbedding } from './embeddings';
import { VectorStore } from './vector-store';

const SYSTEM_PROMPT = `You are an AI assistant that answers questions about the user's uploaded documents.
Answer ONLY based on the context provided below.
After each key statement cite the source in the format [filename].
If the answer is not present in the context, respond with:
'This information was not found in your documents.'
Do not add information from your own knowledge.
Reply in the same language as the question.

Context:
{context}`;

export class RetrievalService {
  private vectorStore: VectorStore;
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.vectorStore = new VectorStore();
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }

  private formatContext(results: { text: string; source: string }[]): string {
    return results
      .map(r => `[${r.source}]:\n${r.text}`)
      .join('\n\n---\n\n');
  }

  async query(question: string, userId: string): Promise<string> {
    const vector = await getEmbedding(question);
    const results = await this.vectorStore.search(vector, userId, 5);

    if (results.length === 0) {
      return 'This information was not found in your documents.';
    }

    const context = this.formatContext(results);
    const prompt = SYSTEM_PROMPT.replace('{context}', context);

    const model = this.genAI.getGenerativeModel({ model: config.gemini.chatModel });
    const res = await model.generateContent([
      { text: `${prompt}\n\nQuestion: ${question}` },
    ]);

    return res.response.text();
  }

  async *queryStream(question: string, userId: string): AsyncGenerator<string> {
    const vector = await getEmbedding(question);
    const results = await this.vectorStore.search(vector, userId, 5);

    if (results.length === 0) {
      yield 'This information was not found in your documents.';
      return;
    }

    const context = this.formatContext(results);
    const prompt = SYSTEM_PROMPT.replace('{context}', context);

    const model = this.genAI.getGenerativeModel({ model: config.gemini.chatModel });
    const res = await model.generateContentStream([
      { text: `${prompt}\n\nQuestion: ${question}` },
    ]);

    for await (const chunk of res.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }
}