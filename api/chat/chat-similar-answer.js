import ServerLoggingService from '../../services/ServerLoggingService.js';
import { VectorService, initVectorService } from '../../services/VectorServiceFactory.js';
import dbConnect from '../../api/db/db-connect.js';
import mongoose from 'mongoose';
import EmbeddingService from '../../services/EmbeddingService.js';
import { AgentOrchestratorService } from '../../agents/AgentOrchestratorService.js';
import { rankerStrategy } from '../../agents/strategies/rankerStrategy.js';
import { createRankerAgent } from '../../agents/AgentFactory.js';

// Look up a similar answer by embedding the question and querying the vector service
// --- Helper functions (small, testable) ---

function validateAndExtract(req) {
    if (req.method !== 'POST') return { error: { code: 405, message: `Method ${req.method} Not Allowed`, headers: { Allow: ['POST'] } } };
    const chatId = req.body?.chatId || null;
    const question = req.body?.question || req.body?.q || '';
    if (!question) return { error: { code: 400, message: 'Missing question' } };
    const selectedAI = req.body?.selectedAI || 'openai';
    const recencyDays = typeof req.body?.recencyDays === 'number' ? req.body.recencyDays : 7;
    const requestedRating = typeof req.body?.expertFeedbackRating === 'number' ? req.body.expertFeedbackRating : 100;
    return { chatId, question, selectedAI, recencyDays, requestedRating };
}

async function retrieveMatches(question, selectedAI, requestedRating, kCandidates = 10) {
    if (!VectorService) await initVectorService();
    const matchesArr = await VectorService.matchQuestions([question], { provider: selectedAI, k: kCandidates, threshold: null, expertFeedbackRating: requestedRating });
    return Array.isArray(matchesArr) && matchesArr.length ? matchesArr[0] : [];
}

async function loadInteractions(matches) {
    await dbConnect();
    const Interaction = mongoose.model('Interaction');
    const ids = Array.from(new Set(matches.map(m => m.interactionId).filter(Boolean)));
    const interactions = await Interaction.find({ _id: { $in: ids } }).populate('answer').populate('question').lean();
    const interactionById = interactions.reduce((acc, it) => { acc[it._id.toString()] = it; return acc; }, {});
    return { interactions, interactionById };
}

function applyRecencyFilter(matches, interactionById, recencyDays) {
    const cutoff = Date.now() - (recencyDays * 24 * 60 * 60 * 1000);
    const recent = [];
    const older = [];
    for (const m of matches) {
        const it = interactionById[m.interactionId?.toString?.() || m.interactionId];
        if (!it || !it.answer) continue;
        const created = new Date(it.createdAt || it._id?.getTimestamp?.() || Date.now()).getTime();
        if (created >= cutoff) recent.push({ match: m, interaction: it }); else older.push({ match: m, interaction: it });
    }
    return [...recent, ...older].slice(0, 5);
}

async function buildQuestionFlows(finalCandidates) {
    // Sort newest-first across candidates
    const sortedByRecencyDesc = finalCandidates.slice().sort((a, b) => {
        const aCreated = new Date(a.interaction.createdAt || a.interaction._id?.getTimestamp?.() || Date.now()).getTime();
        const bCreated = new Date(b.interaction.createdAt || b.interaction._id?.getTimestamp?.() || Date.now()).getTime();
        return bCreated - aCreated;
    });

    const Chat = mongoose.model('Chat');
    const entries = await Promise.all(sortedByRecencyDesc.map(async (c) => {
        const interactionId = c.interaction._id || c.interaction._id?.toString?.() || c.interactionId;
        if (!interactionId) return { candidate: c, questionFlow: null };

        const chat = await Chat.findOne({ interactions: interactionId }).populate({ path: 'interactions', populate: 'question' }).lean();
        if (!chat || !Array.isArray(chat.interactions) || chat.interactions.length === 0) return { candidate: c, questionFlow: null };

        const idx = chat.interactions.findIndex(i => String(i._id) === String(interactionId));
        const endIndex = idx >= 0 ? idx : (chat.interactions.length - 1);

        const flow = [];
        for (let i = endIndex; i >= 0; i--) {
            const qi = chat.interactions[i]?.question;
            if (!qi) continue;
            const text = qi.englishQuestion || qi.content || qi.text;
            if (text) flow.push(text);
        }

        const questionFlow = flow.length ? flow.join('\n\n') : null;
        return { candidate: c, questionFlow };
    }));

    const validEntries = entries.filter(e => e.questionFlow);
    const candidateQuestions = validEntries.map(e => e.questionFlow);
    const orderedCandidates = validEntries.map(e => e.candidate);
    return { candidateQuestions, orderedCandidates };
}

function createRankerAdapter() {
    return async (agentType, localChatId) => {
        const agent = await createRankerAgent(agentType, localChatId);
        return agent;
    };
}

async function callOrchestrator({ chatId, selectedAI, question, formattedForEmbedding, createAgentFn }) {
    const orchestratorRequest = { userQuestion: question, candidateQuestions: formattedForEmbedding };
    try {
        return await AgentOrchestratorService.invokeWithStrategy({ chatId, agentType: selectedAI, request: orchestratorRequest, createAgentFn, strategy: rankerStrategy });
    } catch (err) {
        ServerLoggingService.error('Ranker orchestrator failed', 'chat-similar-answer', err);
        return null;
    }
}

function interpretRankResult(rankResult, formattedForEmbedding) {
    let topIndex = 0;
    if (rankResult && rankResult.results && Array.isArray(rankResult.results) && rankResult.results.length) {
        const first = rankResult.results[0];
        if (typeof first === 'number') topIndex = first;
        else if (typeof first === 'object' && first.index !== undefined) topIndex = first.index;
        else if (typeof first === 'string') {
            const found = formattedForEmbedding.indexOf(first);
            if (found !== -1) topIndex = found;
        }
    }
    return topIndex;
}

function selectChosen(orderedCandidates, finalCandidates, topIndex) {
    const safeIndex = (typeof topIndex === 'number' && topIndex >= 0 && topIndex < orderedCandidates.length) ? topIndex : 0;
    return orderedCandidates[safeIndex] || orderedCandidates[0] || finalCandidates[0];
}

function formatAnswerFromChosen(chosen) {
    if (!chosen || !chosen.interaction || !chosen.interaction.answer) return null;
    const ans = chosen.interaction.answer;
    const text = (Array.isArray(ans.paragraphs) && ans.paragraphs.length) ? ans.paragraphs.join('\n\n') : (ans.content || ans.englishAnswer || '');
    return { text, interactionId: chosen.interaction._id, chosen };
}

// --- Main handler (composed of the helpers above) ---
export default async function handler(req, res) {
    const validated = validateAndExtract(req);
    if (validated.error) {
        if (validated.error.headers) res.setHeader('Allow', validated.error.headers.Allow);
        return res.status(validated.error.code).end(validated.error.message);
    }

    const { chatId, question, selectedAI, recencyDays, requestedRating } = validated;

    try {
        const matches = await retrieveMatches(question, selectedAI, requestedRating, 10);
        if (!matches || matches.length === 0) {
            ServerLoggingService.info('No similar chat matches found', 'chat-similar-answer');
            return res.json({});
        }

        const { interactionById } = await loadInteractions(matches);
        const finalCandidates = applyRecencyFilter(matches, interactionById, recencyDays);
        if (!finalCandidates.length) {
            ServerLoggingService.info('No candidate interactions after recency filter', 'chat-similar-answer');
            return res.json({});
        }

        const { candidateQuestions, orderedCandidates } = await buildQuestionFlows(finalCandidates);
        if (!candidateQuestions || candidateQuestions.length === 0) {
            ServerLoggingService.info('No candidate questions available after building chat flows', 'chat-similar-answer');
            return res.json({});
        }

        const formattedForEmbedding = EmbeddingService.formatQuestionsForEmbedding(candidateQuestions);
        const createAgentFn = createRankerAdapter();
        const rankResult = await callOrchestrator({ chatId, selectedAI, question, formattedForEmbedding, createAgentFn });
        const topIndex = interpretRankResult(rankResult, formattedForEmbedding);

        const chosen = selectChosen(orderedCandidates, finalCandidates, topIndex);
        const formatted = formatAnswerFromChosen(chosen);
        if (!formatted) {
            ServerLoggingService.info('No final chosen interaction', 'chat-similar-answer');
            return res.json({});
        }

        ServerLoggingService.info('Returning chat similarity result (re-ranked)', 'chat-similar-answer', { interactionId: formatted.interactionId, sourceSimilarity: chosen.match?.similarity });
        return res.json({ answer: formatted.text, interactionId: formatted.interactionId, reRanked: true });
    } catch (err) {
        ServerLoggingService.error('Error in chat-similar-answer', 'chat-similar-answer', err);
        return res.status(500).json({ error: 'internal error' });
    }
}
