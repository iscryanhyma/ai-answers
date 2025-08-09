// services/DocDBVectorService.js
// DocumentDB vector search service (Option B: separate sentence_embeddings collection)

import mongoose from 'mongoose';
import dbConnect from '../api/db/db-connect.js';
import ServerLoggingService from './ServerLoggingService.js';
import { Embedding } from '../models/embedding.js';
import cosineSimilarity from 'compute-cosine-similarity';

function toCleanVector(vec) {
  if (!Array.isArray(vec)) throw new Error('Query vector must be an array');
  return vec.map((v, i) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : Number(v);
    if (!Number.isFinite(n)) throw new Error(`Invalid element at ${i}: ${v}`);
    return n;
  });
}

class DocDBVectorService {
  /**
   * @param {{filterQuery?: object, preCheck?: boolean}} opts
   */
  constructor({ filterQuery = {}, preCheck = false } = {}) {
    this.filterQuery = filterQuery;           // applied to QA selection only
    this.preCheck = preCheck;                 // optional data audit before indexing
    this.isInitialized = false;
    this.initializingPromise = null;

    this.collection = null;                   // 'embeddings'
    this.sentenceCollection = null;           // 'sentence_embeddings'

    this.stats = {
      searches: 0,
      qaSearches: 0,
      sentenceSearches: 0,
      totalSearchTime: 0,
      lastInitTime: null,
      embeddings: 0,
      sentences: 0,
    };
  }

  async _ensureVectorIndex(collectionName, keySpec, options, indexName) {
    const db = mongoose.connection.db;
    const list = await db.command({ listIndexes: collectionName });
    const exists = list.cursor.firstBatch.some((i) => i.name === indexName);
    if (exists) return;
    await db.command({
      createIndexes: collectionName,
      indexes: [{ key: keySpec, name: indexName, vectorOptions: options }],
    });
  }

  async initialize() {
    if (this.isInitialized) return;
    if (this.initializingPromise) return this.initializingPromise;

    this.initializingPromise = (async () => {
      await dbConnect();
      this.collection = mongoose.connection.collection('embeddings');
      this.sentenceCollection = mongoose.connection.collection('sentence_embeddings');

      // Optional precheck (raw driver to avoid Mongoose casting issues)
      if (this.preCheck) {
        const badQA = await this.collection.find({
          ...this.filterQuery,
          $or: [
            { questionsAnswerEmbedding: { $exists: false } },
            { questionsAnswerEmbedding: { $size: 0 } },
            { questionsAnswerEmbedding: { $elemMatch: { $not: { $type: 1 } } } }, // 1 = double
          ],
        }).project({ _id: 1 }).toArray();

        const badSent = await this.sentenceCollection.find({
          $or: [
            { embedding: { $exists: false } },
            { embedding: { $size: 0 } },
            { embedding: { $elemMatch: { $not: { $type: 1 } } } },
          ],
        }).project({ _id: 1 }).toArray();

        if (badQA.length || badSent.length) {
          ServerLoggingService.error('Precheck failed', 'vector-service', { badQA: badQA.length, badSent: badSent.length });
          throw new Error('Vector precheck failed: see logs for invalid docs');
        }
      }

      // Infer dims
      const qaSample = await Embedding.findOne({
        questionsAnswerEmbedding: { $exists: true, $not: { $size: 0 } },
        ...this.filterQuery,
      }).lean();
      if (!qaSample) throw new Error('No QA embeddings found to infer dimension');
      const qaDim = qaSample.questionsAnswerEmbedding.length;

      const sentSample = await this.sentenceCollection.findOne(
        { embedding: { $exists: true, $ne: null } },
        { projection: { embedding: 1 } }
      );
      const sentenceDim = sentSample?.embedding?.length ?? qaDim;

      // Ensure vector indexes
      const qaOptions = { type: 'hnsw', similarity: 'cosine', dimensions: qaDim, m: 16, efConstruction: 64 };
      const sentOptions = { type: 'hnsw', similarity: 'cosine', dimensions: sentenceDim, m: 16, efConstruction: 64 };
      try { await this._ensureVectorIndex('embeddings', { questionsAnswerEmbedding: 'vector' }, qaOptions, 'qa_vector_index'); } catch {}
      try { await this._ensureVectorIndex('sentence_embeddings', { embedding: 'vector' }, sentOptions, 'sentence_vector_index'); } catch {}

      // Only count QA and sentence embeddings whose interactions have expertFeedback
      // Get all interactionIds with expertFeedback
      const interactionsWithEF = await mongoose.connection.collection('interactions').find({ expertFeedback: { $exists: true, $ne: null } }).project({ _id: 1 }).toArray();
      const validInteractionIds = interactionsWithEF.map(i => i._id);

      this.stats.embeddings = await this.collection.countDocuments({
        questionsAnswerEmbedding: { $exists: true, $ne: null },
        interactionId: { $in: validInteractionIds },
        ...this.filterQuery,
      });
      this.stats.sentences = await this.sentenceCollection.countDocuments({
        embedding: { $exists: true, $ne: null },
        parentEmbeddingId: { $in: (await this.collection.find({ interactionId: { $in: validInteractionIds } }).project({ _id: 1 }).toArray()).map(e => e._id) },
      });
      this.stats.lastInitTime = new Date();

      this.isInitialized = true;
      this.initializingPromise = null;
    })();

    return this.initializingPromise;
  }

  /**
   * Vector search
   * @param {number[]} vector - query vector
   * @param {number} k - max neighbors to consider/return
   * @param {'qa'|'sentence'} indexType
   * @param {{threshold?: number, efSearch?: number}} opts
   */
  async search(vector, k, indexType = 'qa', opts = {}) {
    if (!this.isInitialized) await this.initialize();
    const cleanVector = toCleanVector(vector);

    const { threshold = null, efSearch = 60 } = opts; // default efSearch a bit higher for recall
    const start = Date.now();

    if (indexType === 'sentence') {
      const pipeline = [
        { $search: { vectorSearch: { vector: cleanVector, path: 'embedding', similarity: 'cosine', k, efSearch } } },
        { $limit: k },
        { $lookup: { from: 'embeddings', localField: 'parentEmbeddingId', foreignField: '_id', as: 'parent' } },
        { $unwind: '$parent' },
        { $lookup: { from: 'interactions', localField: 'parent.interactionId', foreignField: '_id', as: 'inter' } },
        { $unwind: { path: '$inter', preserveNullAndEmptyArrays: true } },
        // Include vector so we can compute numeric score (DocDB doesn't return it)
        { $project: {
          _id: 1,
          parentEmbeddingId: 1,
          sentenceIndex: 1,
          interactionId: '$parent.interactionId',
          expertFeedbackId: '$inter.expertFeedback',
          embedding: 1,
        } },
      ];

      const docs = await this.sentenceCollection.aggregate(pipeline).toArray();

      const out = [];
      for (const r of docs) {
        // compute numeric cosine similarity client-side
        const sim = cosineSimilarity(cleanVector, r.embedding) ?? 0;
        if (threshold !== null && sim < threshold) break; // short-circuit on first below-threshold (ordered results)
        out.push({
          id: r._id.toString(),
          interactionId: r.interactionId?.toString?.() || r.interactionId,
          sentenceIndex: r.sentenceIndex,
          expertFeedbackId: r.expertFeedbackId || null,
          similarity: sim,
        });
        if (out.length >= k) break;
      }

      this.stats.sentenceSearches++;
      this.stats.searches++;
      this.stats.totalSearchTime += Date.now() - start;
      return out;
    }

    // ----- QA search -----
    const pipeline = [
      { $search: { vectorSearch: { vector: cleanVector, path: 'questionsAnswerEmbedding', similarity: 'cosine', k, efSearch } } },
      { $limit: k },
      { $lookup: { from: 'interactions', localField: 'interactionId', foreignField: '_id', as: 'inter' } },
      { $unwind: { path: '$inter', preserveNullAndEmptyArrays: true } },
      { $project: {
        _id: 1,
        interactionId: 1,
        expertFeedbackId: '$inter.expertFeedback',
        questionsAnswerEmbedding: 1, // include vector to compute score
      } },
    ];

    const docs = await this.collection.aggregate(pipeline).toArray();

    const out = [];
    for (const r of docs) {
      const sim = cosineSimilarity(cleanVector, r.questionsAnswerEmbedding) ?? 0;
      if (threshold !== null && sim < threshold) break; // short-circuit
      out.push({
        id: r._id.toString(),
        interactionId: r.interactionId?.toString?.() || r.interactionId,
        expertFeedbackId: r.expertFeedbackId || null,
        similarity: sim,
      });
      if (out.length >= k) break;
    }

    this.stats.qaSearches++;
    this.stats.searches++;
    this.stats.totalSearchTime += Date.now() - start;
    return out;
  }

  getStats() {
    const { searches, qaSearches, sentenceSearches, totalSearchTime, lastInitTime, embeddings, sentences } = this.stats;
    return {
      isInitialized: this.isInitialized,
      embeddings,
      sentences,
      searches,
      qaSearches,
      sentenceSearches,
      averageSearchTimeMs: searches ? totalSearchTime / searches : 0,
      uptimeSeconds: lastInitTime ? (Date.now() - lastInitTime) / 1000 : 0,
    };
  }

  /**
   * Find similar chats by embedding using QA search logic (matches IMVectorService API)
   */
  async findSimilarChats(embedding, { excludeChatId, limit = 20 } = {}) {
    // one call, compute scores client-side, use your configured threshold
    const neighbors = await this.search(embedding, limit * 2, 'qa', { efSearch: 60 });

    const Chat = mongoose.model('Chat');
    const config = await import('../config/eval.js');
    const similarityThreshold = config?.default?.thresholds?.questionAnswerSimilarity ?? 0;

    const results = [];
    for (const n of neighbors) {
      if (n.interactionId && n.similarity > similarityThreshold) {
        const chatDoc = await Chat.findOne({ interactions: n.interactionId }, { chatId: 1 }).lean();
        if (chatDoc && chatDoc.chatId !== excludeChatId) {
          results.push({ chatId: chatDoc.chatId, score: n.similarity });
        }
      }
      if (results.length >= limit) break;
    }

    // Dedupe by chatId, keep highest score
    const deduped = Object.values(results.reduce((acc, cur) => {
      if (!acc[cur.chatId] || acc[cur.chatId].score < cur.score) acc[cur.chatId] = cur;
      return acc;
    }, {}));

    deduped.sort((a, b) => b.score - a.score);
    return deduped.slice(0, limit);
  }

  /**
   * No-op in DocDB service; kept for compatibility with IMVectorService
   */
  addExpertFeedbackEmbedding() {
    // Writes/updates should be handled via your Mongoose models/ETL.
    // Intentionally a no-op for DocDB.
    return;
  }
}

export default DocDBVectorService;
