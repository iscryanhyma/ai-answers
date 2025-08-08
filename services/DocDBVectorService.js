import { Embedding } from '../models/embedding.js';
import ServerLoggingService from './ServerLoggingService.js';
import dbConnect from '../api/db/db-connect.js';
import mongoose from 'mongoose';

/**
 * Utility: validate that a vector is a finite-number array
 */
function isValidVector(vec) {
  return Array.isArray(vec) && vec.every(x => typeof x === 'number' && Number.isFinite(x));
}

/**
 * DocDBVectorService
 * 
 * Allows indexing and searching of embeddings stored in DocumentDB.
 * By default, only expert-feedback embeddings are loaded.
 */
class DocDBVectorService {
  /**
   * @param {Object} [options]
   * @param {Object} [options.filterQuery] - Override filter for selecting embeddings.
   */
  constructor({ filterQuery = { expertFeedback: { $exists: true } } } = {}) {
    ServerLoggingService.debug('Constructor: creating DocDBVectorService instance', 'vector-service');
    this.filterQuery = filterQuery;
    this.isInitialized = false;
    this.initializingPromise = null;
    this.collection = null;
    this.stats = {
      searches: 0,
      qaSearches: 0,
      sentenceSearches: 0,
      totalSearchTime: 0,
      lastInitTime: null,
      embeddings: 0,
      sentences: 0,
      vectorMemoryUsage: {}
    };
    this.embeddingMetadatas = new Map();
    this.sentenceMetadatas = new Map();
  }

  /**
   * Find similar chats by embedding using QA search logic
   * @param {Array<number>} embedding
   * @param {{ excludeChatId?: string, limit?: number }} options
   * @returns {Promise<Array<{ chatId: string, score: number }>>}
   */
  async findSimilarChats(embedding, { excludeChatId, limit = 20 } = {}) {
    // Perform kNN search in QA index
    const neighbors = await this.search(embedding, limit * 2, 'qa');
    // Retrieve Chat model and similarity threshold
    const Chat = mongoose.model('Chat');
    const config = await import('../config/eval.js');
    const threshold = config.default.thresholds.questionAnswerSimilarity;
    const results = [];
    for (const neighbor of neighbors) {
      if (neighbor.interactionId && neighbor.similarity > threshold) {
        // Find chatId for this interaction
        const chatDoc = await Chat.findOne({ interactions: neighbor.interactionId }, { chatId: 1 }).lean();
        if (chatDoc && chatDoc.chatId !== excludeChatId) {
          results.push({ chatId: chatDoc.chatId, score: neighbor.similarity });
        }
      }
      if (results.length >= limit) break;
    }
    // Deduplicate by chatId, keep highest score
    const deduped = Object.values(results.reduce((acc, cur) => {
      if (!acc[cur.chatId] || acc[cur.chatId].score < cur.score) {
        acc[cur.chatId] = cur;
      }
      return acc;
    }, {}));
    // Sort descending by score
    deduped.sort((a, b) => b.score - a.score);
    return deduped.slice(0, limit);
  }

  /**
   * Stub to match IMVectorService API; no-op for DocDB storage
   */
  async addExpertFeedbackEmbedding(params) {
    ServerLoggingService.warn(
      'addExpertFeedbackEmbedding is not supported in DocDBVectorService; re-batch your embeddings in the database',
      'vector-service'
    );
  }

  /**
   * Ensure a vector index via the raw command API (skip if exists)
   */
  async _ensureVectorIndex(collectionName, keySpec, options, indexName) {
    ServerLoggingService.info(`Ensuring vector index '${indexName}'`, 'vector-service');
    const db = mongoose.connection.db;
    const listRes = await db.command({ listIndexes: collectionName });
    const exists = listRes.cursor.firstBatch.some(idx => idx.name === indexName);
    if (exists) {
      ServerLoggingService.info(`Index '${indexName}' already exists, skipping`, 'vector-service');
      return;
    }
    await db.command({
      createIndexes: collectionName,
      indexes: [{ key: keySpec, name: indexName, vectorOptions: options }]
    });
    ServerLoggingService.info(`Vector index '${indexName}' created`, 'vector-service');
  }

  /**
   * Initialize DB connection, indexes, stats, and load metadata maps
   */
  async initialize() {
    ServerLoggingService.debug('initialize: entry', 'vector-service');
    if (this.isInitialized) {
      ServerLoggingService.info('initialize: already initialized, skipping', 'vector-service');
      return;
    }
    if (this.initializingPromise) return this.initializingPromise;

    this.initializingPromise = (async () => {
      ServerLoggingService.info('Initializing DocDBVectorService...', 'vector-service');
      await dbConnect();
      ServerLoggingService.debug('Database connected', 'vector-service');

      this.collection = mongoose.connection.collection('embeddings');
      ServerLoggingService.debug('Obtained collection reference', 'vector-service');

      const baseQuery = {
        questionsAnswerEmbedding: { $exists: true, $ne: null },
        sentenceEmbeddings: { $exists: true, $not: { $size: 0 } },
        ...this.filterQuery
      };

      // Infer embedding dimensionality
      const sample = await Embedding.findOne(baseQuery).lean();
      if (!sample) {
        ServerLoggingService.error('initialize: no sample embedding found', 'vector-service');
        this.initializingPromise = null;
        throw new Error('No embeddings found to infer dimension');
      }
      const dim = sample.questionsAnswerEmbedding.length;
      ServerLoggingService.info(`Inferred embedding dimensionality: ${dim}`, 'vector-service');

      // Ensure vector indexes
      const options = { type: 'hnsw', similarity: 'cosine', dimensions: dim, m: 16, efConstruction: 64 };
      await this._ensureVectorIndex('embeddings', { questionsAnswerEmbedding: 'vector' }, options, 'qa_vector_index');
      await this._ensureVectorIndex('embeddings', { sentenceEmbeddings: 'vector' }, options, 'sentence_vector_index');

      // Collect statistics
      this.stats.embeddings = await Embedding.countDocuments(baseQuery);
      this.stats.sentences = await Embedding.aggregate([
        { $match: baseQuery },
        { $group: { _id: null, total: { $sum: { $size: '$sentenceEmbeddings' } } } }
      ]).then(r => r[0]?.total || 0);

      this.stats.lastInitTime = new Date();

      // Load metadata
      const metaDocs = await Embedding.find(baseQuery)
        .select('_id interactionId chatId questionId answerId createdAt sentenceEmbeddings')
        .lean();

      metaDocs.forEach(doc => {
        const idStr = doc._id.toString();
        this.embeddingMetadatas.set(idStr, {
          interactionId: doc.interactionId.toString(),
          chatId: doc.chatId.toString(),
          questionId: doc.questionId.toString(),
          answerId: doc.answerId.toString(),
          createdAt: doc.createdAt
        });
        doc.sentenceEmbeddings.forEach((_, idx) => {
          const sentId = `${idStr}:${idx}`;
          this.sentenceMetadatas.set(sentId, {
            interactionId: doc.interactionId.toString(),
            chatId: doc.chatId.toString(),
            questionId: doc.questionId.toString(),
            answerId: doc.answerId.toString(),
            createdAt: doc.createdAt,
            sentenceIndex: idx
          });
        });
      });

      this.isInitialized = true;
      this.initializingPromise = null;
      ServerLoggingService.info(
        `DocDBVectorService initialized: ${this.stats.embeddings} QA vectors, ${this.stats.sentences} sentence vectors.`,
        'vector-service'
      );
    })();

    return this.initializingPromise;
  }

  /**
   * Perform a vector search using AWS DocumentDB's vectorSearch operator
   */
  async search(vector, k, indexType = 'qa') {
    if (!this.isInitialized) await this.initialize();
    if (!isValidVector(vector)) {
      ServerLoggingService.error('search: invalid query vector', 'vector-service', { vector });
      throw new Error('Query vector must be an array of finite numbers');
    }

    const start = Date.now();
    const path = indexType === 'qa' ? 'questionsAnswerEmbedding' : 'sentenceEmbeddings';
    const pipeline = [
      { $search: { vectorSearch: { vector, path, similarity: 'cosine', k, efSearch: 40 } } },
      { $limit: k },
      { $project: { _id: 1, similarity: { $meta: 'searchScore' } } }
    ];

    const results = await this.collection.aggregate(pipeline).toArray();
    this.stats[indexType === 'qa' ? 'qaSearches' : 'sentenceSearches']++;
    this.stats.searches++;
    this.stats.totalSearchTime += Date.now() - start;

    return results.map(r => {
      const idStr = r._id.toString();
      const metaMap = indexType === 'qa' ? this.embeddingMetadatas : this.sentenceMetadatas;
      return { similarity: r.similarity, ...(metaMap.get(idStr) || {}) };
    });
  }

  /**
   * Return current statistics
   */
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
      vectorMemoryUsage: this.stats.vectorMemoryUsage
    };
  }
}

export default DocDBVectorService;
