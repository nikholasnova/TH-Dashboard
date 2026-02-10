'use client';

import { useEffect, useState } from 'react';
import { DeploymentWithCount, getDeployments } from '@/lib/supabase';

export function useDeployments(deviceFilter?: string) {
  const [deployments, setDeployments] = useState<DeploymentWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getDeployments()
      .then(setDeployments)
      .finally(() => setIsLoading(false));
  }, []);

  const filteredDeployments = deviceFilter
    ? deployments.filter((d) => d.device_id === deviceFilter)
    : deployments;

  return { deployments, filteredDeployments, isLoading };
}

