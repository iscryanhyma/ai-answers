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
        const { message, chatId = 'system', searchService = 'canadaca', agentType = 'openai' } = req.body;
        ServerLoggingService.info('Received request to search.', chatId, { message, searchService });

        try {
            // Call SearchAgentService to get the search query and originalLang
            const agentResult = await invokeSearchAgent(agentType, { chatId, question: message });
            const searchQuery = agentResult.query;
            const originalLang = agentResult.originalLang || '';
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
