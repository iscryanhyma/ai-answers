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
 * Supports an optional preCheck switch to validate vectors before indexing.
 */
class DocDBVectorService {
  /**
   * @param {Object} [options]
   * @param {Object} [options.filterQuery] - Override filter for selecting embeddings.
   * @param {boolean} [options.preCheck=false] - If true, scan and report invalid vectors before initialization.
   */
  constructor({ filterQuery = { expertFeedback: { $exists: true, $ne: null } }, preCheck = true } = {}) {
    ServerLoggingService.debug('Constructor: creating DocDBVectorService instance', 'vector-service');
    this.filterQuery = filterQuery;
    this.preCheck = preCheck;
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
   */
  async findSimilarChats(embedding, { excludeChatId, limit = 20 } = {}) {
    const neighbors = await this.search(embedding, limit * 2, 'qa');
    const Chat = mongoose.model('Chat');
    const config = await import('../config/eval.js');
    const threshold = config.default.thresholds.questionAnswerSimilarity;
    const results = [];
    for (const neighbor of neighbors) {
      if (neighbor.interactionId && neighbor.similarity > threshold) {
        const chatDoc = await Chat.findOne({ interactions: neighbor.interactionId }, { chatId: 1 }).lean();
        if (chatDoc && chatDoc.chatId !== excludeChatId) {
          results.push({ chatId: chatDoc.chatId, score: neighbor.similarity });
        }
      }
      if (results.length >= limit) break;
    }
    const deduped = Object.values(results.reduce((acc, cur) => {
      if (!acc[cur.chatId] || acc[cur.chatId].score < cur.score) acc[cur.chatId] = cur;
      return acc;
    }, {}));
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
   * Initialize DB connection, optionally precheck vectors, ensure indexes, and load metadata
   */
  async initialize() {
    ServerLoggingService.debug('initialize: entry', 'vector-service');
    if (this.isInitialized) {
      ServerLoggingService.info('initialize: already initialized, skipping', 'vector-service');
      return;
    }
    if (this.initializingPromise) return this.initializingPromise;

    this.initializingPromise = (async () => {
      ServerLoggingService.info('initialize: starting initialization process', 'vector-service');
      ServerLoggingService.debug('initialize: about to connect to database', 'vector-service');
      await dbConnect();
      ServerLoggingService.debug('initialize: database connected successfully', 'vector-service');

      ServerLoggingService.debug('initialize: acquiring collection reference', 'vector-service');
      this.collection = mongoose.connection.collection('embeddings');
      ServerLoggingService.debug('initialize: collection acquired', 'vector-service');

      const baseQuery = {
        questionsAnswerEmbedding: { $exists: true, $ne: null },
        sentenceEmbeddings: { $exists: true, $not: { $size: 0 } },
        ...this.filterQuery
      };
      ServerLoggingService.debug(`initialize: using baseQuery: ${JSON.stringify(baseQuery)}`, 'vector-service');

      // Pre-check invalid vectors if enabled
      if (this.preCheck) {
        ServerLoggingService.info('initialize: prechecking vectors for validity...', 'vector-service');
        const coll = mongoose.connection.db.collection('embeddings');
        // Find docs with empty or non-number QA embeddings
        const badQA = await coll.find({
          ...baseQuery,
          $or: [
            { questionsAnswerEmbedding: { $size: 0 } },
            { questionsAnswerEmbedding: { $elemMatch: { $not: { $type: 1 } } } }
          ]
        }).project({ _id: 1, questionsAnswerEmbedding: 1 }).toArray();
        ServerLoggingService.debug(`initialize: badQA count: ${badQA.length}`, 'vector-service');
        // Find docs with empty or non-number sentence embeddings
        const badSent = await coll.find({
          ...baseQuery,
          $or: [
            { sentenceEmbeddings: { $size: 0 } },
            { sentenceEmbeddings: { $elemMatch: { $elemMatch: { $not: { $type: 1 } } } } }
          ]
        }).project({ _id: 1, sentenceEmbeddings: 1 }).toArray();
        ServerLoggingService.debug(`initialize: badSent count: ${badSent.length}`, 'vector-service');
        if (badQA.length || badSent.length) {
          ServerLoggingService.warn('initialize: found invalid vectors during precheck', 'vector-service');
        }
      }

      // Infer embedding dimensionality
      ServerLoggingService.debug('initialize: fetching a sample document to infer dimension', 'vector-service');
      const sample = await Embedding.findOne(baseQuery).lean();
      if (!sample) {
        ServerLoggingService.error('initialize: no sample embedding found', 'vector-service');
        this.initializingPromise = null;
        throw new Error('No embeddings found to infer dimension');
      }
      const dim = sample.questionsAnswerEmbedding.length;
      ServerLoggingService.info(`initialize: inferred embedding dimensionality: ${dim}`, 'vector-service');

      // Ensure vector indexes
      const options = { type: 'hnsw', similarity: 'cosine', dimensions: dim, m: 16, efConstruction: 64 };
      try {
        ServerLoggingService.debug('initialize: ensuring QA vector index', 'vector-service');
        await this._ensureVectorIndex('embeddings', { questionsAnswerEmbedding: 'vector' }, options, 'qa_vector_index');
        ServerLoggingService.info('initialize: QA vector index ensured', 'vector-service');
      } catch (err) {
        ServerLoggingService.error(`initialize: error ensuring qa_vector_index; continuing: ${err.message}`, 'vector-service');
      }
      try {
        ServerLoggingService.debug('initialize: ensuring sentence vector index', 'vector-service');
        await this._ensureVectorIndex('embeddings', { sentenceEmbeddings: 'vector' }, options, 'sentence_vector_index');
        ServerLoggingService.info('initialize: sentence vector index ensured', 'vector-service');
      } catch (err) {
        ServerLoggingService.error(`initialize: error ensuring sentence_vector_index; continuing: ${err.message}`, 'vector-service');
      }

      // Collect statistics
      ServerLoggingService.debug('initialize: collecting statistics for embeddings', 'vector-service');
      this.stats.embeddings = await Embedding.countDocuments(baseQuery);
      this.stats.sentences = await Embedding.aggregate([
        { $match: baseQuery },
        { $group: { _id: null, total: { $sum: { $size: '$sentenceEmbeddings' } } } }
      ]).then(r => r[0]?.total || 0);
      ServerLoggingService.info(`initialize: collected stats - embeddings: ${this.stats.embeddings}, sentences: ${this.stats.sentences}`, 'vector-service');

      this.stats.lastInitTime = new Date();

      // Load metadata
      ServerLoggingService.debug('initialize: loading metadata from embeddings', 'vector-service');
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
      ServerLoggingService.info('initialize: metadata loading completed', 'vector-service');

      this.isInitialized = true;
      this.initializingPromise = null;
      ServerLoggingService.info(`DocDBVectorService initialized: ${this.stats.embeddings} QA vectors, ${this.stats.sentences} sentence vectors.`, 'vector-service');
    })();

    return this.initializingPromise;
  }

  /**
   * Perform a vector search using AWS DocumentDB's vectorSearch operator
   */
  async search(vector, k, indexType = 'qa') {
    if (!this.isInitialized) await this.initialize();
    if (!Array.isArray(vector)) {
      ServerLoggingService.error('search: vector is not an array', 'vector-service', { vector });
      throw new Error('Query vector must be an array of numbers');
    }
    const cleanVector = vector.map((val, idx) => {
      const num = (typeof val === 'number' && Number.isFinite(val)) ? val : Number(val);
      if (typeof num !== 'number' || !Number.isFinite(num)) {
        ServerLoggingService.error('search: invalid element type for vector', 'vector-service', { index: idx, val });
        throw new Error(`Invalid element type for vector at index ${idx}: ${val}`);
      }
      return num;
    });

    const start = Date.now();
    const path = indexType === 'qa' ? 'questionsAnswerEmbedding' : 'sentenceEmbeddings';
    const pipeline = [
      { $search: { vectorSearch: { vector: cleanVector, path, similarity: 'cosine', k, efSearch: 40 } } },
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
