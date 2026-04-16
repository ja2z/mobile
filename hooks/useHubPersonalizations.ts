import { useCallback, useEffect, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { AuthService } from '../services/AuthService';
import {
  HUB_PERSONALIZATIONS_CHANGED,
  loadAllOverrides,
  type HubOverride,
  type HubOverridesMap,
} from '../utils/hubPersonalizationStorage';

export function useHubPersonalizations() {
  const [overrides, setOverrides] = useState<HubOverridesMap>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const session = await AuthService.getSession();
      if (!session?.user?.userId) {
        setOverrides({});
        return;
      }
      const map = await loadAllOverrides(session.user.userId);
      setOverrides(map);
    } catch {
      setOverrides({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(HUB_PERSONALIZATIONS_CHANGED, reload);
    return () => sub.remove();
  }, [reload]);

  const getOverride = useCallback(
    (id: string): HubOverride | undefined => overrides[id],
    [overrides],
  );

  return { overrides, getOverride, loading };
}
