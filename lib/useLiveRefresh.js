'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// A proofing portal is a page people leave open. A client gets the "your proof
// is ready" email, opens the link, sees nothing yet, and leaves the tab sitting
// there. Without this they keep seeing the state from whenever they first
// loaded it, however many proofs land afterwards.
//
// This also covers signed URL expiry: proof links are valid 12 hours, and a
// refresh mints a fresh set, so a long-lived tab never degrades into broken
// images.
//
// router.refresh() re-runs the server components and leaves client state alone,
// so a half-typed comment or an open modal survives a refresh.
export default function useLiveRefresh(intervalMs = 60000) {
  const router = useRouter();

  useEffect(() => {
    let timer = null;

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const start = () => {
      stop();
      timer = setInterval(refreshIfVisible, intervalMs);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Coming back to the tab is the moment it matters most.
        router.refresh();
        start();
      } else {
        stop();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refreshIfVisible);
    // Restoring from the back/forward cache does not re-run the server render.
    window.addEventListener('pageshow', refreshIfVisible);

    start();

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refreshIfVisible);
      window.removeEventListener('pageshow', refreshIfVisible);
    };
  }, [router, intervalMs]);
}
