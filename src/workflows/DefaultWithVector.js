import ContextService from '../services/ContextService.js';
import AnswerService from '../services/AnswerService.js';
import DataStoreService from '../services/DataStoreService.js';
import LoggingService from '../services/ClientLoggingService.js';
import { getApiUrl } from '../utils/apiToUrl.js';


import { ChatWorkflowService, WorkflowStatus } from '../services/ChatWorkflowService.js';

export class DefaultWithVector {
  constructor() { }

  // Build the persistence payload for a short-circuit similar answer.
  buildShortCircuitPayload({ similarShortCircuit, startTime, endTime, translationData, userMessage, userMessageId, referringUrl, selectedAI, chatId, lang, searchProvider }) {
    const totalResponseTimeSC = endTime - startTime;

    // Build a minimal safe context object (never null)
    const scContext = {
      translatedQuestion: (translationData && translationData.translatedText) || userMessage,
      originalLang: (translationData && translationData.originalLanguage) || lang,
      searchProvider: searchProvider || ''
    };

    const aiCitationUrl = (similarShortCircuit.sourceCitation && similarShortCircuit.sourceCitation.aiCitationUrl)
      || similarShortCircuit.citationUrl
      || null;
    const providedCitationUrl = (similarShortCircuit.sourceCitation && similarShortCircuit.sourceCitation.providedCitationUrl)
      || similarShortCircuit.citationUrl
      || null;
    const citationHead = (similarShortCircuit.answer && similarShortCircuit.answer.citationHead)
      || (similarShortCircuit.sourceCitation && similarShortCircuit.sourceCitation.citationHead)
      || null;

    const contentText = (similarShortCircuit.answer && (similarShortCircuit.answer.content || (Array.isArray(similarShortCircuit.answer.paragraphs) ? similarShortCircuit.answer.paragraphs.join('\n\n') : ''))) || '';
    const parsedSentences = AnswerService.parseSentences(contentText || '');

    const payload = {
      selectedAI: selectedAI,
      question: userMessage,
      userMessageId: userMessageId,
      referringUrl: referringUrl,
      answer: {
        answerType: 'normal',
        content: similarShortCircuit.answer && similarShortCircuit.answer.content,
        paragraphs: (similarShortCircuit.answer && similarShortCircuit.answer.paragraphs) || [],
        sentences: parsedSentences,
        citationHead: citationHead,
        questionLanguage: (translationData && translationData.originalLanguage) || lang,
        englishQuestion: (translationData && translationData.translatedText) || userMessage,
        tools: [],
        citationUrl: aiCitationUrl
      },
      finalCitationUrl: providedCitationUrl,
      confidenceRating: similarShortCircuit.confidenceRating || similarShortCircuit.similarity || null,
      context: scContext,
      chatId: chatId,
      pageLanguage: lang,
      responseTime: totalResponseTimeSC,
      searchProvider: searchProvider
    };

    return payload;
  }

  // Query the chat-similar-answer endpoint and return a short-circuit
  // response object if an answer is available. Returns null to continue
  // the normal workflow when no similar answer is found or an error occurs.
  async checkSimilarAnswer(chatId, userMessage, conversationHistory, onStatusUpdate, selectedAI, pageLang = null, detectedLang = null) {
    try {
      // Build user-only sequence (oldest -> newest) including current user message
      const priorUserTurns = (conversationHistory || [])
        .filter(m => m && m.sender === 'user' && !m.error && typeof m.text === 'string' && m.text.trim())
        .map(m => m.text.trim());
      const questions = [...priorUserTurns, ...(typeof userMessage === 'string' && userMessage.trim() ? [userMessage.trim()] : [])];
      const similarResp = await fetch(getApiUrl('chat-similar-answer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, questions, selectedAI, pageLanguage: pageLang || null, detectedLanguage: detectedLang || null })
      });
      if (similarResp && similarResp.ok) {
        const similarJson = await similarResp.json();
        if (similarJson && similarJson.answer) {
          await LoggingService.info(chatId, 'chat-similar-answer returned, short-circuiting workflow', {
            similar: similarJson
          });
          ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.GENERATING_ANSWER);
          // Build an answer object that matches the UI's expected shape so
          // the message content is displayed. Prefer `paragraphs` (rendered
          // first), but also include `sentences` and `content` for safety.
          const answerText = similarJson.answer;
          return {
            answer: {
              answerType: 'normal',
              content: answerText,
              paragraphs: [answerText],
              sentences: [answerText],
              // expose metadata for potential UI display
              providedByInteractionId: similarJson.interactionId || null,
              similarity: similarJson.similarity || null
              ,
              citationHead: (similarJson.citation && similarJson.citation.citationHead) || null
            },
            context: null,
            question: userMessage,
            citationUrl: (similarJson.citation && (similarJson.citation.providedCitationUrl || similarJson.citation.aiCitationUrl)) || null,
            confidenceRating: similarJson.similarity || null,
            // include full citation info for persistence contract
            sourceCitation: similarJson.citation || null
          };
        }
      } else {
        await LoggingService.info(chatId, 'chat-similar-answer call failed or returned no result', {
          status: similarResp && similarResp.status
        });
      }
    } catch (err) {
      await LoggingService.info(chatId, 'chat-similar-answer error, continuing workflow', { error: err && err.message });
    }
    return null;
  }

  async processResponse(
    chatId,
    userMessage,
    userMessageId,
    conversationHistory,
    lang,
    department,
    referringUrl,
    selectedAI,
    translationF,
    onStatusUpdate,
    searchProvider
  ) {
    const startTime = Date.now();
    await LoggingService.info(chatId, 'Starting DefaultWithVector with data:', {
      lang,
      referringUrl,
      selectedAI,
      startTime
    });
    ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.MODERATING_QUESTION);
    ChatWorkflowService.validateShortQueryOrThrow(conversationHistory, userMessage, lang, department, translationF);

    const { redactedText } = await ChatWorkflowService.processRedaction(userMessage, lang, chatId, selectedAI);
    const translationData = await ChatWorkflowService.translateQuestion(redactedText, lang, selectedAI);

    // run short-circuit similar-answer check using detected/original language from translation
    const detectedLang = (translationData && translationData.originalLanguage) || lang;
    const similarShortCircuit = await this.checkSimilarAnswer(chatId, userMessage, conversationHistory, onStatusUpdate, selectedAI, lang, detectedLang);
    if (similarShortCircuit) {
      await LoggingService.info(chatId, 'Short-circuited similar-answer check succeeded:', { similarShortCircuit });

      const endTimeSC = Date.now();
      const payload = this.buildShortCircuitPayload({ similarShortCircuit, startTime, endTime: endTimeSC, translationData, userMessage, userMessageId, referringUrl, selectedAI, chatId, lang, searchProvider });

      // Persist payload (fire-and-forget) and short-circuit the workflow
      try {
        DataStoreService.persistInteraction(payload);
      } catch (e) {
        await LoggingService.info(chatId, 'Short-circuit persistence error (non-blocking):', { error: e && e.message });
      }

      return similarShortCircuit;
    }

    // move this to the context service
    let context = null;
    conversationHistory = conversationHistory.filter((message) => !message.error);
    conversationHistory = conversationHistory.filter((message) => message.sender === 'ai');
    const usedExistingContext = (
      conversationHistory.length > 0 &&
      !conversationHistory[conversationHistory.length - 1].interaction.answer.answerType.includes('question')
    );

    if (usedExistingContext) {
      const lastMessage = conversationHistory[conversationHistory.length - 1];
      context = lastMessage.interaction.context;
      context.translatedQuestion = translationData.translatedText;
      context.originalLang = translationData.originalLanguage;
      context.outputLang = ContextService.determineOutputLang(lang, translationData);
      // Only run PII check when we did NOT derive new context
      await ChatWorkflowService.checkPIIOnNoContextOrThrow(chatId, userMessage, selectedAI);
    } else {
      context = await ContextService.deriveContext(
        selectedAI,
        translationData.translatedText,
        lang,
        department,
        referringUrl,
        searchProvider,
        conversationHistory,
        chatId,
        translationData
      );
    }
    await LoggingService.info(chatId, 'Derived context:', { context });

    ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.GENERATING_ANSWER);

    const answer = await AnswerService.sendMessage(
      selectedAI,
      conversationHistory,
      lang,
      context,
      referringUrl,
      chatId
    );
    await LoggingService.info(chatId, 'Answer Received:', { answer });
    let finalCitationUrl,
      confidenceRating = null;

    if (answer.answerType === 'normal') {
      ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.VERIFYING_CITATION);
      const citationResult = await ChatWorkflowService.verifyCitation(
        answer.citationUrl,
        lang,
        userMessage,
        department,
        translationF,
        chatId
      );
      finalCitationUrl = citationResult.url || citationResult.fallbackUrl;
      confidenceRating = citationResult.confidenceRating;
      await LoggingService.info(chatId, 'Citation validated:', {
        originalUrl: answer.citationUrl,
        finalCitationUrl,
        confidenceRating,
      });
    }

    if (answer.answerType && answer.answerType.includes('question')) {
      ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.NEED_CLARIFICATION);
    }

    const endTime = Date.now();
    const totalResponseTime = endTime - startTime;
    await LoggingService.info(chatId, 'Total response time:', {
      totalResponseTime: `${totalResponseTime} ms`,
    });

    DataStoreService.persistInteraction({
      selectedAI: selectedAI,
      question: userMessage,
      userMessageId: userMessageId,
      referringUrl: referringUrl,
      answer: answer,
      finalCitationUrl: finalCitationUrl,
      confidenceRating: confidenceRating,
      context: context,
      chatId: chatId,
      pageLanguage: lang,
      responseTime: totalResponseTime,
      searchProvider: searchProvider
    });

    await LoggingService.info(chatId, 'workflow complete');
    return {
      answer: answer,
      context: context,
      question: userMessage,
      citationUrl: finalCitationUrl,
      confidenceRating: confidenceRating,
    };
  }
}
