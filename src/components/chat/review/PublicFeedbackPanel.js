import React, { useState, useCallback } from 'react';
import { GcdsDetails } from '@cdssnc/gcds-components-react';
import FeedbackService from '../../../services/FeedbackService.js';

const PublicFeedbackPanel = ({ message, extractSentences, t }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);

    const handleToggle = useCallback(async (e) => {
        try {
            if (!e.target.open) return;
            if (data) return;
            setLoading(true);
            setError(null);
            const interactionId = (message.interaction && (message.interaction._id || message.interaction.id)) || message.id;
            const result = await FeedbackService.getPublicFeedback({ interactionId });
            setData(result);
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    }, [data, message]);

    if (!message) return null;

    const interaction = message.interaction || {};
    const answer = interaction.answer || {};

    let sentences = [];
    if (Array.isArray(answer.paragraphs) && answer.paragraphs.length > 0) {
        sentences = answer.paragraphs.flatMap(p => extractSentences(p));
    } else if (Array.isArray(answer.sentences) && answer.sentences.length > 0) {
        sentences = answer.sentences;
    }

    const publicFeedback = interaction.publicFeedback || message.publicFeedback || {};

    return (
        <GcdsDetails detailsTitle={t('reviewPanels.publicFeedbackTitle') || 'Public feedback'} className="review-details" tabIndex="0" onGcdsClick={(e) => {
            try {
                if (e && e.target && !e.target.open) {
                    handleToggle(e);
                }
            } catch (err) {
                handleToggle(e);
            }
        }}>
            <div className="review-panel public-feedback-panel">
                {loading && <div>{t('common.loading') || 'Loading...'}</div>}
                {error && <div className="error">{t('common.error') || 'Error'}: {error}</div>}
                <div className="public-feedback-summary">
                    <div>{t('reviewPanels.score') || 'Score'}: {(data && typeof data.publicFeedbackScore !== 'undefined' && data.publicFeedbackScore !== null) ? data.publicFeedbackScore : (typeof publicFeedback.publicFeedbackScore !== 'undefined' && publicFeedback.publicFeedbackScore !== null ? publicFeedback.publicFeedbackScore : (t('reviewPanels.notAvailable') || 'N/A'))}</div>
                    <div>{t('reviewPanels.reason') || 'Reason'}: {(data && data.publicFeedbackReason) || publicFeedback.publicFeedbackReason || ''}</div>
                </div>
                {sentences.length > 0 && (
                    <table className="review-table">
                        <thead>
                            <tr>
                                <th>{t('reviewPanels.sentence') || 'Sentence'}</th>
                                <th>{t('reviewPanels.publicComment') || 'Public comment'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sentences.map((s, i) => {
                                const row = (data && data.sentences && data.sentences[i]) || {};
                                return (
                                    <tr key={i}>
                                        <td>{s}</td>
                                        <td>{row.comment || ((publicFeedback && publicFeedback.feedback) || '')}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </GcdsDetails>
    );
};

export default PublicFeedbackPanel;
