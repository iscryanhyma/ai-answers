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
   * Create a vector index via the raw command API
   */
  async _createVectorIndex(collectionName, keySpec, options, indexName) {
    ServerLoggingService.info(`Creating vector index '${indexName}' via command API`, 'vector-service');
    const db = mongoose.connection.db;
    await db.command({
      createIndexes: collectionName,
      indexes: [
        {
          key: keySpec,
          name: indexName,
          vectorOptions: options
        }
      ]
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

      // Infer embedding dimensionality
      const sample = await Embedding.findOne({ questionsAnswerEmbedding: { $exists: true } }).lean();
      if (!sample) {
        ServerLoggingService.error('initialize: no sample embedding found', 'vector-service');
        this.initializingPromise = null;
        throw new Error('No embeddings found to infer dimension');
      }
      const dim = sample.questionsAnswerEmbedding.length;
      ServerLoggingService.info(`Inferred embedding dimensionality: ${dim}`, 'vector-service');

      // Create vector indexes using raw commands
      const qaOptions = { type: 'hnsw', similarity: 'cosine', dimensions: dim, m: 16, efConstruction: 64 };
      await this._createVectorIndex('embeddings', { questionsAnswerEmbedding: 'vector' }, qaOptions, 'qa_vector_index');

      const sentOptions = { type: 'hnsw', similarity: 'cosine', dimensions: dim, m: 16, efConstruction: 64 };
      await this._createVectorIndex('embeddings', { sentenceEmbeddings: 'vector' }, sentOptions, 'sentence_vector_index');

      // Collect statistics
      const query = {
        questionsAnswerEmbedding: { $exists: true, $ne: null },
        sentenceEmbeddings: { $exists: true, $not: { $size: 0 } }
      };
      this.stats.embeddings = await Embedding.countDocuments(query);
      this.stats.sentences = await Embedding.aggregate([
        { $match: query },
        { $group: { _id: null, total: { $sum: { $size: '$sentenceEmbeddings' } } } }
      ]).then(r => r[0]?.total || 0);

      this.stats.lastInitTime = new Date();

      // Load metadata
      const metaDocs = await Embedding.find(query)
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
      {
        $search: {
          vectorSearch: {
            vector,
            path,
            similarity: 'cosine',
            k,
            efSearch: 40
          }
        }
      },
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
