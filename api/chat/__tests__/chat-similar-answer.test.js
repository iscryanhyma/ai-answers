import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { setup, teardown, reset } from '../../../test/setup.js';
import mongoose from 'mongoose';

// Silence intermittent Mongo disconnect errors that can occur after teardown
process.on('unhandledRejection', (err) => {
  if (err && err.name === 'MongoNotConnectedError') return;
});

// Mocks for modules used by the handler. These mocks must be registered before
// importing the handler module so imports resolve to the mocks.
const mockMatchQuestions = vi.fn();
const mockInitVectorService = vi.fn();
vi.mock('../../../services/VectorServiceFactory.js', () => ({
  VectorService: { matchQuestions: mockMatchQuestions },
  initVectorService: mockInitVectorService,
}));

const mockFormat = vi.fn();
const mockCreateClient = vi.fn();
vi.mock('../../../services/EmbeddingService.js', () => ({
  default: {
    formatQuestionsForEmbedding: mockFormat,
    createEmbeddingClient: mockCreateClient,
  },
}));

const mockInvokeWithStrategy = vi.fn();
vi.mock('../../../agents/AgentOrchestratorService.js', () => ({
  AgentOrchestratorService: { invokeWithStrategy: mockInvokeWithStrategy },
}));

vi.mock('../../../agents/AgentFactory.js', () => ({
  createRankerAgent: vi.fn(),
}));

// Do not mock db-connect here; we will connect mongoose to the in-memory server

describe('chat-similar-answer handler', () => {
  let handler;

  beforeEach(async () => {
    vi.resetAllMocks();

    // provide basic embedding client behaviour
    mockCreateClient.mockReturnValue({ embedDocuments: async (arr) => arr.map(() => [0.1, 0.2]) });
    mockFormat.mockImplementation((qs) => qs.map(q => `FORMATTED: ${q}`));

    // Ensure in-memory Mongo is set up
    await setup();
    await reset();

    // Connect via the app's db-connect to keep a single connection
    const dbConnect = (await import('../../../api/db/db-connect.js')).default;
    await dbConnect();
    // Ensure Answer, Question and Interaction models are registered (db-connect imports them already)
    const AnswerModel = mongoose.model('Answer');
    const QuestionModel = mongoose.model('Question');
    const InteractionModel = mongoose.model('Interaction');

    const [answer1, answer2] = await AnswerModel.create([
      { englishAnswer: 'Answer 1' },
      { englishAnswer: 'Answer 2' },
    ]);

    const [question1, question2] = await QuestionModel.create([
      { englishQuestion: 'Q1', redactedQuestion: 'Q1' },
      { englishQuestion: 'Q2', redactedQuestion: 'Q2' },
    ]);

    await InteractionModel.create([
      { _id: new mongoose.Types.ObjectId('64fec1000000000000000001'), answer: answer1._id, question: question1._id, createdAt: new Date() },
      { _id: new mongoose.Types.ObjectId('64fec1000000000000000002'), answer: answer2._id, question: question2._id, createdAt: new Date() },
    ]);

    // Prepare VectorService to return two matches in order
    mockMatchQuestions.mockResolvedValue([[{ id: 'doc1', interactionId: '64fec1000000000000000001' }, { id: 'doc2', interactionId: '64fec1000000000000000002' }]]);

    // Make the ranker choose the second candidate (index 1)
    mockInvokeWithStrategy.mockResolvedValue({ results: [1] });

    // Import handler after mocks are set up
    handler = (await import('../chat-similar-answer.js')).default;
  });

  afterEach(async () => {
    await teardown();
  });

  it('returns the top re-ranked answer from candidates', async () => {
    const req = { method: 'POST', body: { question: 'How to reset password?', selectedAI: 'openai' } };
    const res = { setHeader: vi.fn(), status: vi.fn(() => res), json: vi.fn(() => res), end: vi.fn() };

    await handler(req, res);

    // Expect VectorService.matchQuestions called with our question
    expect(mockMatchQuestions).toHaveBeenCalled();

    // Expect the orchestrator to have been invoked with formatted questions
    expect(mockInvokeWithStrategy).toHaveBeenCalled();

    // Response should include answer from the chosen (index 1) interaction
    expect(res.json).toHaveBeenCalled();
    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody).toBeDefined();
    expect(responseBody.answer).toContain('Answer 2');
  expect(responseBody.interactionId.toString()).toBe('64fec1000000000000000002');
    expect(responseBody.reRanked).toBe(true);
  });
});
