'use client';

import { useEffect, useState } from 'react';
import { DeploymentWithCount, getDeployments } from '@/lib/supabase';

export function useDeployments() {
  const [deployments, setDeployments] = useState<DeploymentWithCount[]>([]);

  useEffect(() => {
    getDeployments().then(setDeployments);
  }, []);

  return { deployments };
}
