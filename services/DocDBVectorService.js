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

class DocDBVectorService {
  constructor() {
    ServerLoggingService.debug('Constructor: creating DocDBVectorService instance', 'vector-service');
    this.isInitialized = false;
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
  
  /**
   * Find similar chats by embedding using QA search logic
   * @param {Array<number>} embedding - The query embedding
   * @param {Object} options - { excludeChatId, limit }
   * @returns {Promise<Array<{ chatId: string, score: number }>>}
   */
  DocDBVectorService.prototype.findSimilarChats = async function(embedding, { excludeChatId, limit = 20 }) {
    // Use the same search logic as evaluation.worker.js (QA search)
    // This assumes you have a search method that returns neighbors with interactionId and similarity
    const neighbors = await this.search(embedding, limit * 2, 'qa');
    // Get chatId for each neighbor, exclude the source chatId
    const mongoose = require('mongoose');
    const Chat = mongoose.model('Chat');
    const results = [];
    for (const neighbor of neighbors) {
      if (neighbor.interactionId && neighbor.similarity > 0.85) {
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
    // Sort by score descending
    deduped.sort((a, b) => b.score - a.score);
    return deduped;
  };
    this.embeddingMetadatas = new Map();
    this.sentenceMetadatas = new Map();
  }

  /**
   * Ensure a vector index exists with the given spec; if it differs, drop & recreate
   */
  async _ensureIndex(name, keySpec, vectorOptions) {
    ServerLoggingService.debug(`_ensureIndex: checking index '${name}' with spec`, 'vector-service', { keySpec, vectorOptions });
    const existingIndexes = await this.collection.indexes();
    const existing = existingIndexes.find(idx => idx.name === name);
    if (existing) {
      ServerLoggingService.debug(`_ensureIndex: found existing index '${name}'`, 'vector-service', { existing });
      const existingVO = existing.vectorOptions || {};
      if (
        JSON.stringify(existingVO) !== JSON.stringify(vectorOptions) ||
        JSON.stringify(existing.key) !== JSON.stringify(keySpec)
      ) {
        ServerLoggingService.info(`Index '${name}' spec changed, dropping and recreating.`, 'vector-service');
        await this.collection.dropIndex(name);
        ServerLoggingService.debug(`Index '${name}' dropped`, 'vector-service');
        await this.collection.createIndex(keySpec, { name, vectorOptions });
        ServerLoggingService.info(`Index '${name}' recreated`, 'vector-service');
      } else {
        ServerLoggingService.info(`Index '${name}' already exists with matching spec.`, 'vector-service');
      }
    } else {
      ServerLoggingService.info(`Creating vector index '${name}'.`, 'vector-service');
      await this.collection.createIndex(keySpec, { name, vectorOptions });
      ServerLoggingService.info(`Vector index '${name}' created`, 'vector-service');
    }
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

    ServerLoggingService.info('Initializing DocDBVectorService...', 'vector-service');
    await dbConnect();
    ServerLoggingService.debug('Database connected', 'vector-service');

    this.collection = mongoose.connection.collection('embeddings');
    ServerLoggingService.debug('Obtained collection reference', 'vector-service');

    // Infer embedding dimensionality from a sample doc
    ServerLoggingService.debug('Finding sample embedding document', 'vector-service');
    const sample = await Embedding.findOne({ questionsAnswerEmbedding: { $exists: true } }).lean();
    if (!sample) {
      ServerLoggingService.error('initialize: no sample embedding found', 'vector-service');
      throw new Error('No embeddings found to infer dimension');
    }
    const dim = sample.questionsAnswerEmbedding.length;
    ServerLoggingService.info(`Inferred embedding dimensionality: ${dim}`, 'vector-service');

    // Ensure indexes
    const qaOptions = { type: 'hnsw', similarity: 'cosine', dimensions: dim, m: 16, efConstruction: 64 };
    await this._ensureIndex('qa_vector_index', { questionsAnswerEmbedding: 'vector' }, qaOptions);

    const sentOptions = { type: 'hnsw', similarity: 'cosine', dimensions: dim, m: 16, efConstruction: 64 };
    await this._ensureIndex('sentence_vector_index', { sentenceEmbeddings: 'vector' }, sentOptions);

    // Collect statistics counts
    const query = {
      questionsAnswerEmbedding: { $exists: true, $ne: null },
      sentenceEmbeddings: { $exists: true, $not: { $size: 0 } }
    };
    ServerLoggingService.debug('Counting QA embeddings', 'vector-service', { query });
    this.stats.embeddings = await Embedding.countDocuments(query);
    ServerLoggingService.info(`QA embeddings count: ${this.stats.embeddings}`, 'vector-service');

    ServerLoggingService.debug('Counting sentence embeddings total', 'vector-service');
    this.stats.sentences = await Embedding.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: { $size: '$sentenceEmbeddings' } } } }
    ]).then(r => r[0]?.total || 0);
    ServerLoggingService.info(`Sentence embeddings count: ${this.stats.sentences}`, 'vector-service');

    this.stats.lastInitTime = new Date();
    ServerLoggingService.debug('Stats lastInitTime set', 'vector-service', { lastInitTime: this.stats.lastInitTime });

    // Load metadata
    ServerLoggingService.debug('Loading metadata docs', 'vector-service');
    const metaDocs = await Embedding.find(query)
      .select('_id interactionId chatId questionId answerId createdAt sentenceEmbeddings')
      .lean();
    ServerLoggingService.debug(`Retrieved ${metaDocs.length} metadata docs`, 'vector-service');

    metaDocs.forEach(doc => {
      const idStr = doc._id.toString();
      const qaMeta = {
        interactionId: doc.interactionId.toString(),
        chatId: doc.chatId.toString(),
        questionId: doc.questionId.toString(),
        answerId: doc.answerId.toString(),
        createdAt: doc.createdAt
      };
      this.embeddingMetadatas.set(idStr, qaMeta);
      ServerLoggingService.debug('Stored QA metadata', 'vector-service', { idStr, qaMeta });

      doc.sentenceEmbeddings.forEach((_, idx) => {
        const sentId = `${idStr}:${idx}`;
        const sentMeta = {
          interactionId: doc.interactionId.toString(),
          chatId: doc.chatId.toString(),
          questionId: doc.questionId.toString(),
          answerId: doc.answerId.toString(),
          createdAt: doc.createdAt,
          sentenceIndex: idx
        };
        this.sentenceMetadatas.set(sentId, sentMeta);
        ServerLoggingService.debug('Stored sentence metadata', 'vector-service', { sentId, sentMeta });
      });
    });

    this.isInitialized = true;
    ServerLoggingService.info(
      `DocDBVectorService initialized: ${this.stats.embeddings} QA vectors, ${this.stats.sentences} sentence vectors.`,
      'vector-service'
    );
  }

  /**
   * Perform a k-NN search against the specified index ('qa' or 'sentence')
   */
  async search(vector, k, indexType = 'qa') {
    ServerLoggingService.debug('search: entry', 'vector-service', { vector, k, indexType });
    if (!this.isInitialized) {
      ServerLoggingService.info('search: not initialized, calling initialize()', 'vector-service');
      await this.initialize();
    }
    if (!isValidVector(vector)) {
      ServerLoggingService.error('search: invalid query vector', 'vector-service', { vector });
      throw new Error('Query vector must be an array of finite numbers');
    }

    const start = Date.now();
    const indexName = indexType === 'qa' ? 'qa_vector_index' : 'sentence_vector_index';
    const path = indexType === 'qa' ? 'questionsAnswerEmbedding' : 'sentenceEmbeddings';
    const pipeline = [
      { $search: { index: indexName, knn: { vector, path, k } } },
      { $limit: k },
      { $project: { _id: 1, similarity: { $meta: 'searchScore' } } }
    ];
    ServerLoggingService.debug('search: aggregation pipeline built', 'vector-service', { pipeline });

    let results = [];
    try {
      results = await this.collection.aggregate(pipeline).toArray();
      ServerLoggingService.info(`search: retrieved ${results.length} results`, 'vector-service');
      this.stats[indexType === 'qa' ? 'qaSearches' : 'sentenceSearches']++;
      this.stats.searches++;
      this.stats.totalSearchTime += Date.now() - start;
      ServerLoggingService.info(
        `Search (${indexType}) execution time: ${Date.now() - start}ms`,
        'vector-service'
      );
    } catch (err) {
      ServerLoggingService.error('search: error during aggregation', 'vector-service', { error: err.message });
    }

    // Map back to metadata
    ServerLoggingService.debug('search: mapping results to metadata', 'vector-service');
    const mapped = results.map(r => {
      const idStr = r._id.toString();
      const meta = indexType === 'qa'
        ? this.embeddingMetadatas.get(idStr) || {}
        : this.sentenceMetadatas.get(idStr) || {};
      const record = { similarity: r.similarity, ...meta };
      ServerLoggingService.debug('search: mapped record', 'vector-service', { record });
      return record;
    });

    ServerLoggingService.debug('search: exit', 'vector-service', { count: mapped.length });
    return mapped;
  }

  /**
   * Return current statistics
   */
  getStats() {
    ServerLoggingService.debug('getStats: entry', 'vector-service');
    const { searches, qaSearches, sentenceSearches, totalSearchTime, lastInitTime, embeddings, sentences } = this.stats;
    const stats = {
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
    ServerLoggingService.debug('getStats: exit', 'vector-service', { stats });
    return stats;
  }
}

export default DocDBVectorService;
