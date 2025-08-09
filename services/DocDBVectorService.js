// ==============================
// services/DocDBVectorService.js — patched with $lookup to return expertFeedbackId
// ==============================
import mongoose from 'mongoose';
import dbConnect from '../api/db/db-connect.js';
import ServerLoggingService from './ServerLoggingService.js';
import { Embedding } from '../models/embedding.js';

function toCleanVector(vec) {
  if (!Array.isArray(vec)) throw new Error('Query vector must be an array');
  return vec.map((v, i) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : Number(v);
    if (!Number.isFinite(n)) throw new Error(`Invalid element at ${i}: ${v}`);
    return n;
  });
}

class DocDBVectorService {
  constructor({ filterQuery = {}, preCheck = false } = {}) {
    this.filterQuery = filterQuery;           // applied to QA collection only
    this.preCheck = preCheck;                 // optional data audit before indexing
    this.isInitialized = false;
    this.initializingPromise = null;
    this.collection = null;                   // embeddings
    this.sentenceCollection = null;           // sentence_embeddings
    this.stats = { searches: 0, qaSearches: 0, sentenceSearches: 0, totalSearchTime: 0, lastInitTime: null, embeddings: 0, sentences: 0 };
  }

  async _ensureVectorIndex(collectionName, keySpec, options, indexName) {
    const db = mongoose.connection.db;
    const list = await db.command({ listIndexes: collectionName });
    const exists = list.cursor.firstBatch.some((i) => i.name === indexName);
    if (exists) return;
    await db.command({ createIndexes: collectionName, indexes: [{ key: keySpec, name: indexName, vectorOptions: options }] });
  }

  async initialize() {
    if (this.isInitialized) return;
    if (this.initializingPromise) return this.initializingPromise;

    this.initializingPromise = (async () => {
      await dbConnect();
      this.collection = mongoose.connection.collection('embeddings');
      this.sentenceCollection = mongoose.connection.collection('sentence_embeddings');

      // ----- optional precheck using raw driver (no Mongoose casting) -----
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

      // infer dimensions from QA doc; fall back to sentence doc if needed
      const qaSample = await Embedding.findOne({ questionsAnswerEmbedding: { $exists: true, $not: { $size: 0 } }, ...this.filterQuery }).lean();
      if (!qaSample) throw new Error('No QA embeddings found to infer dimension');
      const qaDim = qaSample.questionsAnswerEmbedding.length;

      const sentSample = await this.sentenceCollection.findOne({ embedding: { $exists: true, $ne: null } }, { projection: { embedding: 1 } });
      const sentenceDim = sentSample?.embedding?.length ?? qaDim;

      // ensure indexes
      const qaOptions = { type: 'hnsw', similarity: 'cosine', dimensions: qaDim, m: 16, efConstruction: 64 };
      const sentOptions = { type: 'hnsw', similarity: 'cosine', dimensions: sentenceDim, m: 16, efConstruction: 64 };
      try { await this._ensureVectorIndex('embeddings', { questionsAnswerEmbedding: 'vector' }, qaOptions, 'qa_vector_index'); } catch {}
      try { await this._ensureVectorIndex('sentence_embeddings', { embedding: 'vector' }, sentOptions, 'sentence_vector_index'); } catch {}

      // stats
      this.stats.embeddings = await this.collection.countDocuments({ questionsAnswerEmbedding: { $exists: true, $ne: null }, ...this.filterQuery });
      this.stats.sentences = await this.sentenceCollection.countDocuments({ embedding: { $exists: true, $ne: null } });
      this.stats.lastInitTime = new Date();

      this.isInitialized = true;
      this.initializingPromise = null;
    })();

    return this.initializingPromise;
  }

  // indexType: 'qa' or 'sentence'
  async search(vector, k, indexType = 'qa') {
    if (!this.isInitialized) await this.initialize();
    const cleanVector = toCleanVector(vector);

    const start = Date.now();
    if (indexType === 'sentence') {
      const pipeline = [
        { $search: { vectorSearch: { vector: cleanVector, path: 'embedding', similarity: 'cosine', k, efSearch: 40 } } },
        { $limit: k },
        { $lookup: { from: 'embeddings', localField: 'parentEmbeddingId', foreignField: '_id', as: 'parent' } },
        { $unwind: '$parent' },
        { $lookup: { from: 'interactions', localField: 'parent.interactionId', foreignField: '_id', as: 'inter' } },
        { $unwind: { path: '$inter', preserveNullAndEmptyArrays: true } },
        { $project: {
            _id: 1,
            parentEmbeddingId: 1,
            sentenceIndex: 1,
            interactionId: '$parent.interactionId',
            expertFeedbackId: '$inter.expertFeedback',
            similarity: { $meta: 'searchScore' },
        } },
      ];
      const results = await this.sentenceCollection.aggregate(pipeline).toArray();
      this.stats.sentenceSearches++; this.stats.searches++; this.stats.totalSearchTime += Date.now() - start;
      return results.map((r) => ({
        id: r._id.toString(),
        interactionId: r.interactionId?.toString?.() || r.interactionId,
        sentenceIndex: r.sentenceIndex,
        expertFeedbackId: r.expertFeedbackId || null,
        similarity: r.similarity,
      }));
    }

    // QA search with join to interactions for expertFeedbackId
    const pipeline = [
      { $search: { vectorSearch: { vector: cleanVector, path: 'questionsAnswerEmbedding', similarity: 'cosine', k, efSearch: 40 } } },
      { $limit: k },
      { $lookup: { from: 'interactions', localField: 'interactionId', foreignField: '_id', as: 'inter' } },
      { $unwind: { path: '$inter', preserveNullAndEmptyArrays: true } },
      { $project: {
          _id: 1,
          interactionId: 1,
          expertFeedbackId: '$inter.expertFeedback',
          similarity: { $meta: 'searchScore' },
      } },
    ];
    const results = await this.collection.aggregate(pipeline).toArray();
    this.stats.qaSearches++; this.stats.searches++; this.stats.totalSearchTime += Date.now() - start;
    return results.map((r) => ({
      id: r._id.toString(),
      interactionId: r.interactionId?.toString?.() || r.interactionId,
      expertFeedbackId: r.expertFeedbackId || null,
      similarity: r.similarity,
    }));
  }
}

export default DocDBVectorService;

