import { contextSearch as canadaContextSearch } from '../../agents/tools/canadaCaContextSearch.js';
import { contextSearch as googleContextSearch } from '../../agents/tools/googleContextSearch.js';
import { exponentialBackoff } from '../../src/utils/backoff.js';
import ServerLoggingService from '../../services/ServerLoggingService.js';
import { invokeSearchAgent } from '../../services/SearchAgentService.js';

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
            // Call SearchAgentService to get the search query and originalLang, passing referring URL for context
            const agentResult = await invokeSearchAgent(agentType, { chatId, question: message, referringUrl });
            const searchQuery = agentResult.query;
            const originalLang = agentResult.originalLang || '';

            // If the context/search agent returned PII information, skip external search
            // and return empty search results merged with the agent result.
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

            const piiPresent = agentResult && ('pii' in agentResult) && !isEmptyPIIValue(agentResult.pii);

            if (piiPresent) {
                ServerLoggingService.info('PII present in agentResult; skipping external search and returning agentResult with empty search results.', chatId, { agentResult });
                const emptySearchResults = { results: [], items: [], total: 0, searchResults: [] };
                res.json({
                    ...emptySearchResults,
                    ...agentResult
                });
                return;
            }
            ServerLoggingService.info('SearchContextAgent:', chatId, agentResult );
            
            // Determine lang
            const lang = originalLang.toLowerCase().includes('fr') ? 'fr' : 'en';
            const searchResults = await performSearch(searchQuery, lang, searchService, chatId);
            ServerLoggingService.debug('Search results:', chatId, searchResults);
            // Merge agentResult values into the response
            res.json({
                ...searchResults,
                ...agentResult
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
