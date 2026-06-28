import { posthog } from './posthog';

export function track(
  event: string,
  properties?: Record<string, any>
) {
  posthog.capture(event, properties);
}