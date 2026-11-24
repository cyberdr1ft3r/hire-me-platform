import { useEffect, useRef } from 'react';
import { CandidateGoogleChallengeSchema } from '@hire-me/contracts';

import { candidateRequest } from './api.js';

type GoogleApi = {
  initialize(options: {
    client_id: string;
    nonce: string;
    callback: (result: { credential: string }) => void;
  }): void;
  renderButton(element: HTMLElement, options: { theme: 'outline'; locale: string }): void;
};
const googleWindow = window as Window & { google?: { accounts: { id: GoogleApi } } };
let scriptLoad: Promise<void> | undefined;

function loadGoogle(): Promise<void> {
  if (googleWindow.google) return Promise.resolve();
  scriptLoad ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      scriptLoad = undefined;
      reject(new Error('Google Sign-In is unavailable.'));
    };
    document.head.append(script);
  });
  return scriptLoad;
}

export function CandidateGoogleButton({
  clientId,
  locale,
  onResult,
  onError,
}: {
  clientId: string;
  locale: string;
  onResult: (credential: string) => void;
  onError: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    const element = mount.current!;
    void loadGoogle()
      .then(async () => {
        if (!active) return;
        const { nonce } = CandidateGoogleChallengeSchema.parse(
          await candidateRequest('google/challenge', {}),
        );
        if (!active) return;
        const provider = googleWindow.google?.accounts.id;
        if (!provider) throw new Error();
        provider.initialize({
          client_id: clientId,
          nonce,
          callback: ({ credential }) => {
            if (active && credential) onResult(credential);
          },
        });
        provider.renderButton(element, { theme: 'outline', locale });
      })
      .catch(() => {
        if (active) onError();
      });
    return () => {
      active = false;
      element.replaceChildren();
    };
  }, [clientId, locale, onError, onResult]);

  return <div ref={mount} />;
}
