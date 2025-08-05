import axios from 'axios';
import { Agent } from 'https';
import ServerLoggingService from '../../services/ServerLoggingService.js';

export default async function handler(req, res) {
  const { url, chatId } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Function to check if a URL is a Canada.ca domain
  const isCanadaCaDomain = (url) => {
    return url.startsWith('https://www.canada.ca') || url.startsWith('http://www.canada.ca');
  };

  // If not a Canada.ca domain, return early with basic validation
  if (!isCanadaCaDomain(url)) {
    return res.status(200).json({
      isValid: true,
      url: url,
      confidenceRating: 0.25,
    });
  }

  // Define known 404 pages
  const notFoundPages = [
    'https://www.canada.ca/errors/404.html',
    'https://www.canada.ca/fr/erreurs/404.html',
  ];

  try {
    const httpsAgent = new Agent({ rejectUnauthorized: false });
    let response;
    let usedHead = false;
    try {
      // Try HEAD first with a fast timeout
      response = await axios.head(url, {
        httpsAgent,
        maxRedirects: 10,
        timeout: 10000,
        headers: {
          'User-Agent': process.env.USER_AGENT || 'ai-answers',
        }
      });
      usedHead = true;
    } catch (headError) {
      // If HEAD is not allowed or fails, fall back to GET
      if (headError.response && headError.response.status === 405) {
        // 405 Method Not Allowed
          response = await axios.get(url, {
            httpsAgent,
            maxRedirects: 10,
            timeout: 10000,
            headers: {
              'User-Agent': process.env.USER_AGENT || 'ai-answers',
            }
          });
      } else if (headError.code === 'ECONNABORTED' || headError.code === 'ETIMEDOUT') {
        // HEAD timed out, try GET as fallback
        response = await axios.get(url, {
          httpsAgent,
          maxRedirects: 10,
          timeout: 10000,
          headers: {
            'User-Agent': process.env.USER_AGENT || 'ai-answers',
          }
        });
      } else {
        // Other errors, rethrow to outer catch
        throw headError;
      }
    }

    // Log the check with ServerLoggingService
    ServerLoggingService.info(
      `Checked URL: ${url} => ${response.status} (${response.request?.res?.responseUrl || url}) [${usedHead ? 'HEAD' : 'GET'}]`,
      chatId || 'system',
      {
        url,
        status: response.status,
        finalUrl: response.request?.res?.responseUrl || url,
        method: usedHead ? 'HEAD' : 'GET',
      }
    );

    // Check if the final URL (after potential redirects) is a known 404 page
    const finalUrl = response.request?.res?.responseUrl || url;
    if (notFoundPages.some((notFoundUrl) => finalUrl.includes(notFoundUrl))) {
      return res.status(200).json({ isValid: false });
    }

    // Check for 404 status
    if (response.status === 404) {
      return res.status(200).json({ isValid: false });
    }

    return res.status(200).json({
      isValid: true,
      url: finalUrl,
      confidenceRating: 1,
    });
  } catch (error) {
    ServerLoggingService.error(
      `Error checking URL: ${url}`,
      chatId || 'system',
      error
    );
    if (error.code === 'ECONNREFUSED') {
      return res.status(500).json({ error: `Connection refused: ${url}` });
    } else if (error.response?.status === 403) {
      return res.status(403).json({ error: `Access forbidden (403): ${url}` });
    } else if (error.response?.status === 404) {
      return res.status(404).json({ error: `Page not found (404): ${url}` });
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return res.status(500).json({ error: `Request timed out: ${url}` });
    } else {
      return res.status(500).json({ error: `URL check failed: ${url} - ${error.message}` });
    }
  }
}
