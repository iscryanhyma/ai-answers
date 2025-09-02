import { contextSearch as canadaContextSearch } from '../../agents/tools/canadaCaContextSearch.js';
import { contextSearch as googleContextSearch } from '../../agents/tools/googleContextSearch.js';
import { exponentialBackoff } from '../../src/utils/backoff.js';
import ServerLoggingService from '../../services/ServerLoggingService.js';
import { invokePIIAgent } from '../../services/PIIAgentService.js';
import { invokeQueryRewriteAgent } from '../../services/QueryRewriteAgentService.js';

async function performSearch(query, lang, searchService = 'canadaca', chatId = 'system') {
    const searchFunction = searchService.toLowerCase() === 'google' 
        ? googleContextSearch 
        : canadaContextSearch;
        
    return await exponentialBackoff(() => searchFunction(query, lang));
}

export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { message, chatId = 'system', searchService = 'canadaca', agentType = 'openai', referringUrl = '' } = req.body;
        ServerLoggingService.info('Received request to search.', chatId, { searchService, referringUrl });

        try {
            // First: detect PII and language
            const piiResult = await invokePIIAgent(agentType, { chatId, question: message });
            if ((piiResult.blocked === true) || (piiResult.pii !== null)) {
                const emptySearchResults = { results: [], items: [], total: 0, searchResults: [] };
                res.json({
                    ...emptySearchResults,
                    ...piiResult
                });
                return;
            }
            
            // No blocked content: perform query rewrite (translation + search query)
            const rewriteResult = await invokeQueryRewriteAgent(agentType, { chatId, question: message, referringUrl });
            const searchQuery = rewriteResult.query;
            const originalLang = (rewriteResult.originalLang || '').toString();
            ServerLoggingService.info('SearchContextAgent rewrite result:', chatId, { originalLang, ...rewriteResult });
            
            // Determine lang
            const lang = originalLang.toLowerCase().includes('fr') ? 'fr' : 'en';
            const searchResults = await performSearch(searchQuery, lang, searchService, chatId);
            ServerLoggingService.debug('Search results:', chatId, searchResults);
            // Merge agentResult values into the response
            res.json({
                ...searchResults,
                ...rewriteResult,
                ...piiResult,
                originalLang,
            });
        } catch (error) {
            ServerLoggingService.error('Error processing search:', chatId, error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}
