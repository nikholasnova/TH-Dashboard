'use client';

import { useEffect, useState } from 'react';
import { DeploymentWithCount, getDeployments } from '@/lib/supabase';
import { useGuest } from '@/contexts/GuestContext';
import { guestGetDeployments } from '@/lib/supabase/guestQueries';

export function useDeployments(deviceFilter?: string) {
  const [deployments, setDeployments] = useState<DeploymentWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { isGuest } = useGuest();

  useEffect(() => {
    const fetchDeps = isGuest ? guestGetDeployments : getDeployments;
    fetchDeps()
      .then(setDeployments)
      .finally(() => setIsLoading(false));
  }, [isGuest]);

  const filteredDeployments = deviceFilter
    ? deployments.filter((d) => d.device_id === deviceFilter)
    : deployments;

  return { deployments, filteredDeployments, isLoading };
}

