'use client';

import { useEffect, useState } from 'react';
import { DeploymentWithCount, getDeployments } from '@/lib/supabase';
import { useGuest } from '@/contexts/GuestContext';
import { guestGetDeployments } from '@/lib/supabase/guestQueries';

export function useDeployments() {
  const [deployments, setDeployments] = useState<DeploymentWithCount[]>([]);
  const { isGuest } = useGuest();

  useEffect(() => {
    const fetchDeps = isGuest ? guestGetDeployments : getDeployments;
    fetchDeps().then(setDeployments);
  }, [isGuest]);

  return { deployments };
}

