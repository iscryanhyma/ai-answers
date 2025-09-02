import ServerLoggingService from '../../services/ServerLoggingService.js';
import { VectorService, initVectorService } from '../../services/VectorServiceFactory.js';
import dbConnect from '../../api/db/db-connect.js';
import mongoose from 'mongoose';
import EmbeddingService from '../../services/EmbeddingService.js';
import { AgentOrchestratorService } from '../../agents/AgentOrchestratorService.js';
import { rankerStrategy } from '../../agents/strategies/rankerStrategy.js';
import { createRankerAgent } from '../../agents/AgentFactory.js';

// --- Main handler (composed of the helpers above) ---
export default async function handler(req, res) {
    const validated = validateAndExtract(req);
    if (validated.error) {
        if (validated.error.headers) res.setHeader('Allow', validated.error.headers.Allow);
        return res.status(validated.error.code).end(validated.error.message);
    }

    const { chatId, questions, selectedAI, recencyDays, requestedRating } = validated;

    try {

        const matches = await retrieveMatches(questions, selectedAI, requestedRating, 10);
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

        const { candidateQuestions, orderedEntries } = await buildQuestionFlows(finalCandidates);
        if (!candidateQuestions || candidateQuestions.length === 0) {
            ServerLoggingService.info('No candidate questions available after building chat flows', 'chat-similar-answer');
            return res.json({});
        }

        const formattedForEmbedding = EmbeddingService.formatQuestionsForEmbedding(candidateQuestions);
        const formattedUserQuestions = EmbeddingService.formatQuestionsForEmbedding(questions);
        const createAgentFn = createRankerAdapter();
        const rankResult = await callOrchestrator({ chatId, selectedAI, userQuestions: formattedUserQuestions, candidateQuestions: formattedForEmbedding, createAgentFn });
        const topIndex = interpretRankResult(rankResult);

        if (topIndex === -1) {
            ServerLoggingService.info('Ranker produced no usable result; continuing normal flow', 'chat-similar-answer');
            return res.json({});
        }
        const topRankerItem = (rankResult && Array.isArray(rankResult.results) && rankResult.results.length) ? rankResult.results[0] : null;
        const topChecks = (topRankerItem && typeof topRankerItem === 'object' && topRankerItem.checks) ? topRankerItem.checks : null;

        const targetTurnIndex = Math.max(0, (questions?.length || 1) - 1);
        const rankedIndices = getRankedIndices(rankResult, orderedEntries.length);
        const chosen = selectChosenByTurn(orderedEntries, finalCandidates, rankedIndices, topIndex, targetTurnIndex);
        const formatted = formatAnswerFromChosen(chosen, targetTurnIndex);
        if (!formatted) {
            ServerLoggingService.info('No final chosen interaction', 'chat-similar-answer');
            return res.json({});
        }

        ServerLoggingService.info('Returning chat similarity result (re-ranked)', 'chat-similar-answer', { interactionId: formatted.interactionId, sourceSimilarity: chosen.match?.similarity });

        return res.json({
            answer: formatted.text,
            englishAnswer: formatted.englishAnswer || null,
            interactionId: formatted.interactionId,
            reRanked: true,
            similarity: chosen.match?.similarity ?? null,
            citation: formatted.citation || null,
            rankerTop: { index: topIndex, checks: topChecks }
        });
    } catch (err) {
        ServerLoggingService.error('Error in chat-similar-answer', 'chat-similar-answer', err);
        return res.status(500).json({ error: 'internal error' });
    }

    function validateAndExtract(req) {
        if (req.method !== 'POST') return { error: { code: 405, message: `Method ${req.method} Not Allowed`, headers: { Allow: ['POST'] } } };
        const chatId = req.body?.chatId || null;
        const questions = Array.isArray(req.body?.questions) ? req.body.questions.filter(q => typeof q === 'string' && q.trim()).map(q => q.trim()) : [];
        if (questions.length === 0) return { error: { code: 400, message: 'Missing questions' } };
        const selectedAI = req.body?.selectedAI || 'openai';
        const recencyDays = typeof req.body?.recencyDays === 'number' ? req.body.recencyDays : 7;
        const requestedRating = typeof req.body?.expertFeedbackRating === 'number' ? req.body.expertFeedbackRating : 100;
        return { chatId, questions, selectedAI, recencyDays, requestedRating };
    }



    async function retrieveMatches(questionsArr, selectedAI, requestedRating, kCandidates = 10) {
        if (!VectorService) await initVectorService();
        const safeQuestions = Array.isArray(questionsArr) && questionsArr.length ? questionsArr : [''];
        const matchesArr = await VectorService.matchQuestions(safeQuestions, { provider: selectedAI, k: kCandidates, threshold: null, expertFeedbackRating: requestedRating });
        return Array.isArray(matchesArr) && matchesArr.length ? matchesArr[0] : [];
    }

    async function loadInteractions(matches) {
        await dbConnect();
        const Interaction = mongoose.model('Interaction');
        const ids = Array.from(new Set(matches.map(m => m.interactionId).filter(Boolean)));
        // Populate the answer and its nested citation so callers can access citation URLs
        const interactions = await Interaction.find({ _id: { $in: ids } })
            .populate({ path: 'answer', populate: { path: 'citation', model: 'Citation' } })
            .populate('question')
            .lean();
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

            // Ensure the populated interaction answers include the nested citation documents
            const chat = await Chat.findOne({ interactions: interactionId }).populate({
                path: 'interactions',
                populate: [
                    { path: 'question' },
                    { path: 'answer', populate: { path: 'citation', model: 'Citation' } }
                ]
            }).lean();
            if (!chat || !Array.isArray(chat.interactions) || chat.interactions.length === 0) return { candidate: c, questionFlow: null };

            const idx = chat.interactions.findIndex(i => String(i._id) === String(interactionId));
            const endIndex = idx >= 0 ? idx : (chat.interactions.length - 1);

            // Build flow interactions from oldest up to the current/matched index
            const flowInteractions = chat.interactions.slice(0, endIndex + 1);
            const flowQuestions = flowInteractions.map(int => {
                const qi = int?.question;
                return qi?.englishQuestion || qi?.content || qi?.text || null;
            }).filter(Boolean);

            const questionFlow = flowQuestions.length ? flowQuestions.join('\n\n') : null;
            return { candidate: c, questionFlow, flowInteractions };
        }));

        const validEntries = entries.filter(e => e.questionFlow);
        const candidateQuestions = validEntries.map(e => e.questionFlow);
        const orderedEntries = validEntries;
        return { candidateQuestions, orderedEntries };
    }

    function createRankerAdapter() {
        return async (agentType, localChatId) => {
            const agent = await createRankerAgent(agentType, localChatId);
            return agent;
        };
    }

    async function callOrchestrator({ chatId, selectedAI, userQuestions, candidateQuestions, createAgentFn }) {
        const orchestratorRequest = { userQuestions, candidateQuestions };
        try {
            return await AgentOrchestratorService.invokeWithStrategy({ chatId, agentType: selectedAI, request: orchestratorRequest, createAgentFn, strategy: rankerStrategy });
        } catch (err) {
            ServerLoggingService.error('Ranker orchestrator failed', 'chat-similar-answer', err);
            return null;
        }
    }

    function interpretRankResult(rankResult) {
        let topIndex = -1;
        const allPass = (checks) => checks && Object.values(checks).every(v => String(v).toLowerCase() === 'pass');
        if (rankResult && Array.isArray(rankResult.results) && rankResult.results.length) {
            for (const item of rankResult.results) {
                if (item && typeof item === 'object' && typeof item.index === 'number') {
                    if (allPass(item.checks)) { topIndex = item.index; break; }
                    else continue; // skip failed checks
                }
                // For legacy shapes (number/string) without checks, do not consider as a match
            }
        }
        return topIndex;
    }
    function getRankedIndices(rankResult, maxLen) {
        const out = [];
        const allPass = (checks) => checks && Object.values(checks).every(v => String(v).toLowerCase() === 'pass');
        if (rankResult && Array.isArray(rankResult.results)) {
            for (const r of rankResult.results) {
                if (r && typeof r === 'object' && typeof r.index === 'number' && allPass(r.checks)) {
                    out.push(r.index);
                }
            }
        }
        // Ensure indices are within range and unique in order
        const seen = new Set();
        const filtered = out.filter(i => Number.isInteger(i) && i >= 0 && i < maxLen && !seen.has(i) && seen.add(i));
        return filtered;
    }

    function selectChosenByTurn(orderedEntries, finalCandidates, rankedIndices, topIndex, targetTurnIndex) {
        // Prefer the highest-ranked entry that has at least targetTurnIndex+1 turns
        for (const idx of rankedIndices) {
            const entry = orderedEntries[idx];
            if (entry && Array.isArray(entry.flowInteractions) && entry.flowInteractions.length > targetTurnIndex) {
                return entry;
            }
        }
        const safeIndex = (typeof topIndex === 'number' && topIndex >= 0 && topIndex < orderedEntries.length) ? topIndex : 0;
        return orderedEntries[safeIndex] || orderedEntries[0] || finalCandidates[0];
    }

    function formatAnswerFromChosen(chosenEntry, targetTurnIndex) {
        if (!chosenEntry) return null;
        const flow = chosenEntry.flowInteractions;
        let selected = null;
        if (Array.isArray(flow) && flow.length) {
            const idx = Math.min(Math.max(0, targetTurnIndex), flow.length - 1);
            selected = flow[idx];
        }
        if (!selected) selected = chosenEntry.candidate?.interaction;
        if (!selected || !selected.answer) return null;
    const ans = selected.answer;
    // Prefer englishAnswer when present; fall back to paragraphs or content
    const englishAnswer = ans?.englishAnswer || null;
    const text = englishAnswer || ((Array.isArray(ans.paragraphs) && ans.paragraphs.length) ? ans.paragraphs.join('\n\n') : (ans.content || ''));

    // Extract citation fields if populated (answer.citation may be a populated doc)
    const citationDoc = ans?.citation || null;
        const citation = citationDoc ? {
            providedCitationUrl: citationDoc.providedCitationUrl || null,
            aiCitationUrl: citationDoc.aiCitationUrl || null,
            citationHead: citationDoc.citationHead || null,
            confidenceRating: citationDoc.confidenceRating || null,
        } : null;

    return { text, englishAnswer, interactionId: selected._id, citation, chosen: chosenEntry };
    }


}
