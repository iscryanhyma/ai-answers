import ServerLoggingService from '../../services/ServerLoggingService.js';
import { VectorService, initVectorService } from '../../services/VectorServiceFactory.js';
import dbConnect from '../../api/db/db-connect.js';
import mongoose from 'mongoose';

// Look up a similar answer by embedding the question and querying the vector service
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const chatId = req.body?.chatId || null;
    const question = req.body?.question || req.body?.q || '';
    if (!question) return res.status(400).json({ error: 'Missing question' });

    try {
        // Ensure vector service initialized
        if (!VectorService) await initVectorService();

        // Run matchQuestions for a single question. Use requested similarity and
        // rating values if provided, otherwise default to .95 and 100.
        const requestedSimilarity = typeof req.body?.similarity === 'number' ? req.body.similarity : 0.95;
        const requestedRating = typeof req.body?.expertFeedbackRating === 'number' ? req.body.expertFeedbackRating : 100;
        const selectedAI = req.body?.selectedAI || 'openai';
        const matchesArr = await VectorService.matchQuestions([question], { provider: selectedAI, k: 1, threshold: requestedSimilarity, expertFeedbackRating: requestedRating });
        const matches = Array.isArray(matchesArr) && matchesArr.length ? matchesArr[0] : [];

        if (!matches || matches.length === 0) {
            ServerLoggingService.info('No similar chat matches found', 'chat-similar-answer');
            return res.json({});
        }

        // Load the top interaction and its Answer
        await dbConnect();
        const Interaction = mongoose.model('Interaction');


        const top = matches[0];
        const interaction = await Interaction.findById(top.interactionId).populate('answer').lean();
        if (!interaction || !interaction.answer) {
            ServerLoggingService.info('Match found but interaction/answer missing', 'chat-similar-answer', { top });
            return res.json({});
        }

        // Prefer paragraphs or content
        const ans = interaction.answer;
        const text = (Array.isArray(ans.paragraphs) && ans.paragraphs.length) ? ans.paragraphs.join('\n\n') : (ans.content || ans.englishAnswer || '');

        ServerLoggingService.info('Returning chat similarity result', 'chat-similar-answer', { interactionId: interaction._id, similarity: top.similarity });
        return res.json({ answer: text, interactionId: interaction._id, similarity: top.similarity });
    } catch (err) {
        ServerLoggingService.error('Error in chat-similar-answer', 'chat-similar-answer', err);
        return res.status(500).json({ error: 'internal error' });
    }
}
