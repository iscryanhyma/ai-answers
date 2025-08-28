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

            // If PII present, short-circuit and return empty search results with PII metadata
            const isEmptyPIIValue = (v) => {
                if (v === null || v === undefined) return true;
                if (typeof v === 'string') {
                    const s = v.trim().toLowerCase();
                    return s === '' || s === 'null';
                }
                if (Array.isArray(v)) return v.length === 0;
                if (typeof v === 'object') return Object.keys(v).length === 0;
                return false;
            };

            const piiPresent = piiResult && ('pii' in piiResult) && !isEmptyPIIValue(piiResult.pii);

            if (piiPresent) {
                ServerLoggingService.info('PII present; skipping external search and returning PII result with empty search results.', chatId, { piiResult });
                const emptySearchResults = { results: [], items: [], total: 0, searchResults: [] };
                res.json({
                    ...emptySearchResults,
                    ...piiResult
                });
                return;
            }
            
            // No PII: perform query rewrite (translation + search query)
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
                originalLang,
                pii: null
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
