import React from 'react';
import { GcdsDetails } from '@cdssnc/gcds-components-react';

const EvalPanel = ({ message, t, reviewMode }) => {
  if (!message) return null;
  const display=false;
  // When in review mode, auto-eval should be hidden temporarily.
  if (!display) {
    // Placeholder while auto-eval is disabled in review mode.
    return null;
  }

  const evalObj = message.interaction?.eval || message.eval || {};

  const sentenceTrace = Array.isArray(evalObj.sentenceMatchTrace) ? evalObj.sentenceMatchTrace : [];

  return (
    <GcdsDetails detailsTitle={t('reviewPanels.autoEvalTitle') || t('reviewPanels.evaluation') || 'Auto-eval'} className="review-details" tabIndex="0">
      <div className="review-panel eval-panel">
        <div className="eval-summary">
          <div>{t('reviewPanels.processed') || 'Processed'}: {evalObj.processed ? (t('common.yes') || 'yes') : (t('common.no') || 'no')}</div>
          <div>{t('reviewPanels.hasMatches') || 'Has matches'}: {evalObj.hasMatches ? (t('common.yes') || 'yes') : (t('common.no') || 'no')}</div>
          <div>{t('reviewPanels.fallback') || 'Fallback'}: {evalObj.fallbackType || (t('reviewPanels.none') || 'none')}</div>
        </div>
        {sentenceTrace.length > 0 ? (
          <table className="review-table">
            <thead>
              <tr>
                <th>{t('reviewPanels.sourceSentenceIndex') || 'Source sentence index'}</th>
                <th>{t('reviewPanels.sourceText') || 'Source text'}</th>
                <th>{t('reviewPanels.matchedChatId') || 'Matched chatId'}</th>
                <th>{t('reviewPanels.matchedSentenceIndex') || 'Matched sentence index'}</th>
                <th>{t('reviewPanels.similarity') || 'Similarity'}</th>
                <th>{t('reviewPanels.matchedScore') || 'Matched score'}</th>
              </tr>
            </thead>
            <tbody>
              {sentenceTrace.map((s, i) => (
                <tr key={i}>
                  <td>{s.sourceIndex}</td>
                  <td>{s.sourceSentenceText || ''}</td>
                  <td>{s.matchedChatId || ''}</td>
                  <td>{typeof s.matchedSentenceIndex !== 'undefined' ? s.matchedSentenceIndex : ''}</td>
                  <td>{typeof s.similarity !== 'undefined' ? s.similarity : ''}</td>
                  <td>{typeof s.matchedExpertFeedbackSentenceScore !== 'undefined' ? s.matchedExpertFeedbackSentenceScore : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>{t('reviewPanels.noSentenceTraces') || 'No sentence match traces available.'}</div>
        )}
      </div>
    </GcdsDetails>
  );
};

export default EvalPanel;
