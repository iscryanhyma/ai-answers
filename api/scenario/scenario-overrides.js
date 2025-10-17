import { ScenarioOverrideService } from '../../services/ScenarioOverrideService.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';

const SUPPORTED_DEPARTMENTS = {
  'CRA-ARC': async () => {
    const mod = await import('../../src/services/systemPrompt/context-cra-arc/cra-arc-scenarios.js');
    return mod.CRA_ARC_SCENARIOS || '';
  },
  'EDSC-ESDC': async () => {
    const mod = await import('../../src/services/systemPrompt/context-edsc-esdc/edsc-esdc-scenarios.js');
    return mod.EDSC_ESDC_SCENARIOS || '';
  },
  'HC-SC': async () => {
    const mod = await import('../../src/services/systemPrompt/context-hc-sc/hc-sc-scenarios.js');
    return mod.HC_SC_SCENARIOS || '';
  },
  'IRCC': async () => {
    const mod = await import('../../src/services/systemPrompt/context-ircc/ircc-scenarios.js');
    return mod.IRCC_SCENARIOS || '';
  },
  'PSPC-SPAC': async () => {
    const mod = await import('../../src/services/systemPrompt/context-pspc-spac/pspc-spac-scenarios.js');
    return mod.PSPC_SPAC_SCENARIOS || '';
  },
  'SAC-ISC': async () => {
    const mod = await import('../../src/services/systemPrompt/context-sac-isc/sac-isc-scenarios.js');
    return mod.SAC_ISC_SCENARIOS || '';
  },
};

async function safeLoad(loader) {
  try {
    const text = await loader();
    if (typeof text === 'string') {
      return text;
    }
    return '';
  } catch (error) {
    console.error('Failed to load default scenario text:', error);
    return '';
  }
}

async function loadDefaultScenarios(departmentKey) {
  if (departmentKey) {
    const loader = SUPPORTED_DEPARTMENTS[departmentKey];
    if (!loader) {
      return '';
    }
    return safeLoad(loader);
  }

  const entries = await Promise.all(
    Object.entries(SUPPORTED_DEPARTMENTS).map(async ([key, loader]) => {
      const text = await safeLoad(loader);
      return [key, text];
    })
  );
  return Object.fromEntries(entries);
}

async function handler(req, res) {
  try { console.log('scenario-overrides API hit', { method: req.method, query: req.query, body: req.body, user: req.user && { userId: req.user.userId, role: req.user.role } }); } catch (e) { /* ignore */ }
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (req.method === 'GET') {
    try {
      const { departmentKey } = req.query || {};
      const defaults = await loadDefaultScenarios(departmentKey);

      if (departmentKey) {
        const override = await ScenarioOverrideService.getActiveOverride(userId, departmentKey);
        return res.status(200).json({
          departmentKey,
          defaultText: typeof defaults === 'string' ? defaults : '',
          override: override ? {
            overrideText: override.overrideText,
            enabled: override.enabled,
            updatedAt: override.updatedAt,
          } : null,
        });
      }

      const overrides = await ScenarioOverrideService.getOverridesForUser(userId);
      const overridesByKey = overrides.reduce((acc, item) => {
        acc[item.departmentKey] = item;
        return acc;
      }, {});

      const defaultEntries = defaults && typeof defaults === 'object' ? defaults : {};
      const departmentKeys = new Set([
        ...Object.keys(defaultEntries),
        ...overrides.map((item) => item.departmentKey).filter(Boolean),
      ]);

      const payload = Array.from(departmentKeys).map((key) => {
        const defaultText = defaultEntries[key] || '';
        const override = overridesByKey[key];
        return {
          departmentKey: key,
          defaultText,
          overrideText: override ? override.overrideText : '',
          enabled: override ? override.enabled : false,
          updatedAt: override ? override.updatedAt : null,
        };
      });

      return res.status(200).json({ overrides: payload });
    } catch (error) {
      console.error('scenario overrides GET error:', error);
      return res.status(500).json({ message: 'Failed to load scenario overrides' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { departmentKey, overrideText, enabled = true } = req.body || {};
      if (!departmentKey || typeof departmentKey !== 'string') {
        return res.status(400).json({ message: 'Invalid department key' });
      }
      if (typeof overrideText !== 'string' || !overrideText.trim()) {
        return res.status(400).json({ message: 'overrideText is required' });
      }

      const updated = await ScenarioOverrideService.upsertOverride({
        userId,
        departmentKey,
        overrideText,
        enabled: Boolean(enabled),
        updatedBy: userId,
      });

      return res.status(200).json({
        departmentKey,
        overrideText: updated.overrideText,
        enabled: updated.enabled,
        updatedAt: updated.updatedAt,
      });
    } catch (error) {
      console.error('scenario overrides POST error:', error);
      return res.status(500).json({ message: 'Failed to save scenario override' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { departmentKey } = req.query || {};
      if (!departmentKey || typeof departmentKey !== 'string') {
        return res.status(400).json({ message: 'Invalid department key' });
      }
      await ScenarioOverrideService.deleteOverride(userId, departmentKey);
      return res.status(204).end();
    } catch (error) {
      console.error('scenario overrides DELETE error:', error);
      return res.status(500).json({ message: 'Failed to delete scenario override' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ message: 'Method Not Allowed' });
}

export default function scenarioOverrideHandler(req, res) {
  return withProtection(handler, authMiddleware, partnerOrAdminMiddleware)(req, res);
}
