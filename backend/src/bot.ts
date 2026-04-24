import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import * as http from 'http';
import { config } from './lib/config';
import { logger } from './lib/logger';
import { VectorStore } from './services/vector-store';
import { DocumentProcessor } from './services/document-processor';
import { RetrievalService } from './services/retrieval';
 
// ── Service initialisation ────────────────────────────────────────────────
const vectorStore = new VectorStore();
const processor   = new DocumentProcessor(vectorStore);
const retrieval   = new RetrievalService();
const bot         = new Telegraf(config.telegram.token);
 
// ── Health check server ───────────────────────────────────────────────────
// Runs on port 3001 so GitHub Actions can verify the deploy succeeded.
// Separate from the Telegraf HTTP server (port 3000) to avoid conflicts.
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
  } else {
    res.writeHead(404); res.end();
  }
}).listen(3001);
 
// ── Command handlers ──────────────────────────────────────────────────────
bot.start(ctx => ctx.reply(
  '👋 Hello! I answer questions about your documents.\n\n' +
  '📄 /upload — index a PDF document\n' +
  '❓ Send any message — I will answer from your documents\n' +
  '🗑 /clear — remove all your documents',
));
 
bot.command('upload', ctx => {
  ctx.reply('📎 Send a PDF file (up to 20 MB).');
});
 
bot.command('clear', async ctx => {
  await vectorStore.deleteByUser(String(ctx.from.id));
  ctx.reply('🗑 All your documents have been removed.');
  logger.info('User cleared documents', { userId: ctx.from.id });
});
 
// ── Document upload ───────────────────────────────────────────────────────
bot.on(message('document'), async ctx => {
  const doc = ctx.message.document;
 
  if (!doc.mime_type?.includes('pdf')) {
    return ctx.reply('❌ Only PDF files are supported.');
  }
  if (doc.file_size && doc.file_size > 20 * 1024 * 1024) {
    return ctx.reply('❌ File exceeds the 20 MB limit.');
  }
 
  const status = await ctx.reply('⏳ Processing document…');
  const userId = String(ctx.from.id);
 
  try {
    // Download the file from Telegram's CDN
    const link   = await ctx.telegram.getFileLink(doc.file_id);
    const res    = await fetch(link.href);
    const buffer = Buffer.from(await res.arrayBuffer());
 
    const result = await processor.processPdf(buffer, doc.file_name ?? 'document.pdf', userId);
 
    logger.info('Document indexed', { userId, ...result });
 
    await ctx.telegram.editMessageText(
      ctx.chat.id, status.message_id, undefined,
      `✅ Document indexed\n` +
      `📊 Chunks: ${result.chunksCount}\n` +
      `💰 Embedding cost: ~$${result.costEstimateUsd.toFixed(4)}\n\n` +
      `Ask me anything about it!`,
    );
  } catch (err) {
    logger.error('Failed to process document', { userId, error: (err as Error).message });
    await ctx.telegram.editMessageText(
      ctx.chat.id, status.message_id, undefined,
      '❌ Failed to process the document. Please try again.',
    );
  }
});
 
// ── Question handling ─────────────────────────────────────────────────────
bot.on(message('text'), async ctx => {
  if (ctx.message.text.startsWith('/')) return;
 
  const userId   = String(ctx.from.id);
  const question = ctx.message.text;

  const { VectorStore } = await import('./services/vector-store');
  const { getEmbedding } = await import('./services/embeddings');
  const store = new VectorStore();
  const vec = await getEmbedding(question);
  const hits = await store.search(vec, userId, 3);
  console.log('Direct search hits:', hits.length, hits.map(h => h.score.toFixed(3)));


  const status   = await ctx.reply('🔍 Searching…');
 
  try {
    const answer = await retrieval.query(question, userId);
    await ctx.telegram.editMessageText(
      ctx.chat.id, status.message_id, undefined,
      answer, { parse_mode: 'Markdown' },
    );
    logger.info('Query answered', { userId, question });
  } catch (err) {
    logger.error('Query failed', { userId, error: (err as Error).message });
    await ctx.telegram.editMessageText(
      ctx.chat.id, status.message_id, undefined,
      '❌ Something went wrong. Please rephrase your question.',
    );
  }
});
 
// ── Launch ────────────────────────────────────────────────────────────────
async function main() {
  await vectorStore.ensureCollection();
 
  if (config.env === 'production') {
    // Webhook mode: Telegram pushes updates to our HTTPS endpoint.
    // Nginx terminates TLS and forwards plain HTTP to port 3000.
    const webhookUrl = config.telegram.webhookUrl!;
    await bot.telegram.setWebhook(webhookUrl);
    logger.info('Webhook registered', { url: webhookUrl });
    bot.launch({ webhook: { domain: webhookUrl, port: 3000 } });
  } else {
    // Long-polling mode for local development — no public URL required.
    await bot.launch();
    logger.info('Bot started in long-polling mode');
  }
}
 
process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
 
main().catch(err => { logger.error('Startup failed', { error: err.message }); process.exit(1); });
