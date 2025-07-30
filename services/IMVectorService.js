// IMVectorService.js
// This is your current VectorService implementation, renamed for clarity
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { VectorDB } = require('imvectordb');
import { Embedding } from '../models/embedding.js';
import { Interaction } from '../models/interaction.js';
import { ExpertFeedback } from '../models/expertFeedback.js';
import ServerLoggingService from './ServerLoggingService.js';
import dbConnect from '../api/db/db-connect.js';

function isValidVector(vec) {
  return Array.isArray(vec) && vec.every(x => typeof x === 'number' && Number.isFinite(x));
}

class IMVectorService {
  constructor() {
    this.qaDB = new VectorDB();
    this.sentenceDB = new VectorDB();
    this.isInitialized = false;
    this.initializingPromise = null; // Guard for concurrent initialization
    this.embeddingMetadatas = new Map();
    this.sentenceMetadatas = new Map();
    this.stats = { searches:0, qaSearches:0, sentenceSearches:0, totalSearchTime:0, lastInitTime:null, embeddings:0, sentences:0, vectorMemoryUsage: {} };
  }

  /**
   * Find similar chats by embedding using QA search logic
   * @param {Array<number>} embedding - The query embedding
   * @param {Object} options - { excludeChatId, limit }
   * @returns {Promise<Array<{ chatId: string, score: number }>>}
   */
  async findSimilarChats(embedding, { excludeChatId, limit = 20 }) {
    // Use the same search logic as evaluation.worker.js (QA search)
    // This assumes you have a search method that returns neighbors with interactionId and similarity
    const neighbors = await this.search(embedding, limit * 2, 'qa');
    // Get chatId for each neighbor, exclude the source chatId
    const mongoose = require('mongoose');
    const Chat = mongoose.model('Chat');
    const config = await import('../config/eval.js');
    const similarityThreshold = config.default.thresholds.questionAnswerSimilarity;
    const results = [];
    for (const neighbor of neighbors) {
      if (neighbor.interactionId && neighbor.similarity > similarityThreshold) {
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
  }

  /**
   * Add a new expert feedback embedding to the vector DBs and metadata map.
   * Call this after saving a new ExpertFeedback and its associated Embedding.
   * @param {Object} params
   * @param {ObjectId} params.interactionId - The interaction ID
   * @param {ObjectId} params.expertFeedbackId - The expert feedback ID
   * @param {Date} params.createdAt - The creation date
   * @param {Array} params.questionsAnswerEmbedding - The QA embedding vector
   * @param {Array} params.answerEmbedding - The answer embedding vector
   */
  addExpertFeedbackEmbedding({ interactionId, expertFeedbackId, createdAt, questionsAnswerEmbedding, sentenceEmbeddings }) {
    // Validate QA embedding
    if (!isValidVector(questionsAnswerEmbedding)) {
      throw new Error('Invalid questionsAnswerEmbedding: must be an array of finite numbers');
    }
    // Use next available index as ID for QA
    const qaId = String(this.stats.embeddings);
    this.embeddingMetadatas.set(qaId, {
      interactionId: interactionId?.toString(),
      expertFeedbackId: expertFeedbackId?.toString(),
      createdAt
    });
    this.qaDB.add({ id: qaId, embedding: questionsAnswerEmbedding });
    this.stats.embeddings++;

    // Add sentences to sentenceDB
    if (Array.isArray(sentenceEmbeddings)) {
      sentenceEmbeddings.forEach((sentenceEmbedding, idx) => {
        if (!isValidVector(sentenceEmbedding)) {
          throw new Error(`Invalid sentenceEmbedding at index ${idx}: must be an array of finite numbers`);
        }
        const sentId = `${interactionId}:${idx}`;
        this.sentenceMetadatas.set(sentId, {
          interactionId: interactionId?.toString(),
          expertFeedbackId: expertFeedbackId?.toString(),
          createdAt,
          sentenceIndex: idx
        });
        this.sentenceDB.add({ id: sentId, embedding: sentenceEmbedding });
        this.stats.sentences++;
      });
    }
    this._calculateVectorMemoryUsage();
    // No per-addition logging
  }

  async initialize() {
    if (this.isInitialized) return;
    if (this.initializingPromise) return this.initializingPromise;

    this.initializingPromise = (async () => {
      const initStart = Date.now();
      ServerLoggingService.info('Initializing VectorService...', 'vector-service');
      await dbConnect();

      const expertFeedbacks = await ExpertFeedback.find({ type: 'expert' }).select('_id').lean();
      if (!expertFeedbacks.length) {
        ServerLoggingService.warn('No expert feedback found—service remains empty.', 'vector-service');
        this.isInitialized = true;
        this.initializingPromise = null;
        return;
      }

      const interactions = await Interaction.find({ expertFeedback: { $in: expertFeedbacks.map(f => f._id) } })
        .select('_id expertFeedback').lean();

      if (!interactions.length) {
        ServerLoggingService.warn('No interactions found—service remains empty.', 'vector-service');
        this.isInitialized = true;
        this.initializingPromise = null;
        return;
      }

      const interactionIds = interactions.map(i => i._id.toString());
      const query = {
        interactionId: { $in: interactionIds },
        questionsAnswerEmbedding: { $exists: true, $ne: null },
        sentenceEmbeddings: { $exists: true, $not: { $size: 0 } }
      };

      const totalEmbeddings = await Embedding.countDocuments(query);

      if (!totalEmbeddings) {
        ServerLoggingService.warn('No embeddings found—service remains empty.', 'vector-service');
        this.isInitialized = true;
        this.initializingPromise = null;
        return;
      }

      const chunkSize = 10;
      let embeddingDocs;
      for (let i = 0; i < totalEmbeddings; i += chunkSize) {
        embeddingDocs = await Embedding.find(query).skip(i).limit(chunkSize).lean();

        embeddingDocs.forEach((doc) => {
          const feedback = interactions.find(n => n._id.toString() === doc.interactionId.toString())?.expertFeedback;
          this.addExpertFeedbackEmbedding({
            interactionId: doc.interactionId.toString(),
            expertFeedbackId: feedback?._id.toString(),
            createdAt: doc.createdAt,
            questionsAnswerEmbedding: doc.questionsAnswerEmbedding,
            sentenceEmbeddings: doc.sentenceEmbeddings
          });
        });
        // Update memory usage stats after each chunk for live reporting
        this._calculateVectorMemoryUsage(embeddingDocs);
      }

      this.stats.lastInitTime = new Date();
      this.stats.initDurationMs = Date.now() - initStart;
      this.isInitialized = true;
      this.initializingPromise = null;
      this._calculateVectorMemoryUsage(embeddingDocs);
      ServerLoggingService.info(`VectorService initialized: ${this.stats.embeddings} QA vectors, ${this.stats.sentences} sentence vectors loaded. Initialization took ${this.stats.initDurationMs}ms.`, 'vector-service');
    })();

    return this.initializingPromise;
  }

  _calculateVectorMemoryUsage(embeddingDocs) {
    // Estimate memory usage for QA and sentence vectors
    let qaVectorMemory = 0;
    let sentenceVectorMemory = 0;
    let vectorDimension = 0;
    if (embeddingDocs && embeddingDocs.length > 0) {
      vectorDimension = embeddingDocs[0].questionsAnswerEmbedding.length;
      qaVectorMemory = this.stats.embeddings * vectorDimension * 8;
      // Estimate sentence vector size
      if (embeddingDocs[0].sentenceEmbeddings && embeddingDocs[0].sentenceEmbeddings.length > 0) {
        sentenceVectorMemory = this.stats.sentences * embeddingDocs[0].sentenceEmbeddings[0].length * 8;
      }
    }
    let metadataMemory = 0;
    for (const value of this.embeddingMetadatas.values()) {
      metadataMemory += Buffer.byteLength(JSON.stringify(value), 'utf8');
    }
    for (const value of this.sentenceMetadatas.values()) {
      metadataMemory += Buffer.byteLength(JSON.stringify(value), 'utf8');
    }
    const totalVectorMemory = qaVectorMemory + sentenceVectorMemory + metadataMemory;
    this.stats.vectorMemoryUsage = {
      total: `${(totalVectorMemory / 1024 / 1024).toFixed(2)} MB`,
      qaVectors: `${(qaVectorMemory / 1024 / 1024).toFixed(2)} MB`,
      sentenceVectors: `${(sentenceVectorMemory / 1024 / 1024).toFixed(2)} MB`,
      metadata: `${(metadataMemory / 1024 / 1024).toFixed(2)} MB`
    };
  }

  async search(vector, k, indexType = 'qa') {
    if (!this.isInitialized) await this.initialize();

    // Always convert to a plain array to strip Proxy/typed array wrappers
    let plainVector = Array.isArray(vector) ? Array.from(vector) : vector;
    if (!isValidVector(plainVector)) {
      console.error('Invalid query vector for search:', plainVector, 'Type:', Object.prototype.toString.call(plainVector));
      throw new Error('Query vector must be an array of finite numbers');
    }

    let db, metaMap, statKey;
    if (indexType === 'qa') {
      db = this.qaDB;
      metaMap = this.embeddingMetadatas;
      statKey = 'qaSearches';
    } else if (indexType === 'sentence') {
      db = this.sentenceDB;
      metaMap = this.sentenceMetadatas;
      statKey = 'sentenceSearches';
    } else {
      throw new Error('Unknown indexType for VectorService.search');
    }
    const start = Date.now();
    const results = await db.query(plainVector, k);
    this.stats.searches++;
    this.stats[statKey]++;
    this.stats.totalSearchTime += Date.now() - start;
    // Only return plain objects (no Map, no class instances)
    const neighbors = results.map(r => {
      const meta = metaMap.get(r.document.id);
      // Defensive: ensure meta is a plain object and clone it
      const safeMeta = meta ? JSON.parse(JSON.stringify(meta)) : {};
      return {
        similarity: r.similarity,
        ...safeMeta
      };
    });
    ServerLoggingService.debug(`Search (${indexType}) returned ${neighbors.length} results in ${Date.now() - start}ms`, 'vector-service');
    return neighbors;
  }

  getStats() {
    const { searches, qaSearches, sentenceSearches, totalSearchTime, lastInitTime, embeddings, sentences, initDurationMs } = this.stats;

    return {
      isInitialized: this.isInitialized,
      embeddings,
      sentences,
      searches,
      qaSearches,
      sentenceSearches,
      averageSearchTimeMs: searches ? totalSearchTime / searches : 0,
      uptimeSeconds: lastInitTime ? (Date.now() - lastInitTime) / 1000 : 0,
      initDurationMs,
      vectorMemoryUsage: this.stats.vectorMemoryUsage
    };
  }
}

export default IMVectorService;
