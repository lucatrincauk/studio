
'use client';

import { Toaster as ShadCNToaster } from "@/components/ui/toaster";
import { useState, useEffect } from 'react';

export function ClientOnlyToaster() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return <ShadCNToaster />;
}
