import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

export function getPostHogClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return null;

  if (!posthogClient) {
    posthogClient = new PostHog(key, {
      host,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}
