import ServerLoggingService from '../../services/ServerLoggingService.js';
import { invokePIIAgent } from '../../services/PIIAgentService.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { message, chatId = 'system', agentType = 'openai' } = req.body || {};
    ServerLoggingService.info('PII check request received.', chatId, { agentType });

    const piiResult = await invokePIIAgent(agentType, { chatId, question: message });
    const pii = (piiResult && Object.prototype.hasOwnProperty.call(piiResult, 'pii')) ? piiResult.pii : null;

    ServerLoggingService.info('PII check completed.', chatId, { hasPII: !!(pii && String(pii).trim() && String(pii).toLowerCase() !== 'null') });

    return res.json({
      ...piiResult,
      pii,
    });
  } catch (error) {
    ServerLoggingService.error('Error processing PII check.', req?.body?.chatId || 'system', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

