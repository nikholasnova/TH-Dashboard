'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import type { Device } from '@/lib/supabase';
import { getDevices } from '@/lib/supabase';
import { useSession } from '@/components/AuthProvider';
import { useGuest } from '@/contexts/GuestContext';
import { guestGetDevices } from '@/lib/supabase/guestQueries';

const FALLBACK_DEVICES: Device[] = [
  { id: 'node1', display_name: 'Node 1', color: '#374151', is_active: true, monitor_enabled: true, sort_order: 1, created_at: '', updated_at: '' },
  { id: 'node2', display_name: 'Node 2', color: '#16a34a', is_active: true, monitor_enabled: true, sort_order: 2, created_at: '', updated_at: '' },
];

interface DevicesContextValue {
  devices: Device[];
  allDevices: Device[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const DevicesContext = createContext<DevicesContextValue>({
  devices: FALLBACK_DEVICES,
  allDevices: FALLBACK_DEVICES,
  isLoading: true,
  refresh: async () => {},
});

async function fetchAllDevices() {
  const all = await getDevices(false);
  const active = all.filter(d => d.is_active);
  return { active, all };
}

export function DevicesProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const { isGuest } = useGuest();
  const [devices, setDevices] = useState<Device[]>(FALLBACK_DEVICES);
  const [allDevices, setAllDevices] = useState<Device[]>(FALLBACK_DEVICES);
  const [isLoading, setIsLoading] = useState(true);
  const fetchVersionRef = useRef(0);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!session && !isGuest && hasLoadedRef.current) return;
    const version = ++fetchVersionRef.current;

    const load = isGuest
      ? guestGetDevices(false).then((all) => ({
          active: all.filter((d) => d.is_active),
          all,
        }))
      : fetchAllDevices();

    load.then(({ active, all }) => {
      if (fetchVersionRef.current !== version) return;
      setDevices(active);
      setAllDevices(all);
      setIsLoading(false);
      hasLoadedRef.current = true;
    }).catch(() => {
      if (fetchVersionRef.current !== version) return;
      setIsLoading(false);
    });
  }, [session, isGuest]);

  const refresh = useCallback(async () => {
    const version = ++fetchVersionRef.current;
    const { active, all } = isGuest
      ? await guestGetDevices(false).then((a) => ({
          active: a.filter((d) => d.is_active),
          all: a,
        }))
      : await fetchAllDevices();
    if (fetchVersionRef.current !== version) return;
    setDevices(active);
    setAllDevices(all);
  }, [isGuest]);

  return (
    <DevicesContext.Provider value={{ devices, allDevices, isLoading, refresh }}>
      {children}
    </DevicesContext.Provider>
  );
}

export function useDevices() {
  return useContext(DevicesContext);
}
