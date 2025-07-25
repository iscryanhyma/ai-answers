import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';

class EvaluationService {
  static async generateEvals({ lastProcessedId = null, startTime, endTime } = {}) {
    try {
      const payload = { action: 'generate' };
      if (lastProcessedId) payload.lastProcessedId = lastProcessedId;
      if (startTime) payload.startTime = startTime;
      if (endTime) payload.endTime = endTime;
      const response = await AuthService.fetchWithAuth(getApiUrl('db-generate-evals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Failed to generate evals');
      return await response.json();
    } catch (error) {
      console.error('Error generating evals:', error);
      throw error;
    }
  }

  static async deleteEvals({ startTime, endTime }) {
    try {
      const payload = {};
      if (startTime) payload.startTime = startTime;
      if (endTime) payload.endTime = endTime;
      payload.action = 'delete';
      const response = await AuthService.fetchWithAuth(getApiUrl('db-generate-evals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Failed to delete evaluations');
      return await response.json();
    } catch (error) {
      console.error('Error deleting evaluations:', error);
      throw error;
    }
  }

  static async getEvalNonEmptyCount() {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl('db-eval-non-empty-count'));
      if (!response.ok) throw new Error('Failed to get non-empty eval count');
      const data = await response.json();
      return data.count;
    } catch (error) {
      console.error('Error getting non-empty eval count:', error);
      return 0;
    }
  }

  static async getExpertFeedbackCount() {
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl('db-expert-feedback-count'));
      if (!response.ok) throw new Error('Failed to get expert feedback count');
      const data = await response.json();
      return data.count;
    } catch (error) {
      console.error('Error getting expert feedback count:', error);
      throw error;
    }
  }
}

export default EvaluationService;
