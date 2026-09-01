import { createHash } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";

export type MediaReadObservation = {
  viewerUserId: string;
  objectKey: string;
  surface: string;
  revalidated: boolean;
};

/**
 * Media reads are the one authenticated surface with no rate limit, so before
 * choosing a limit we need to know what ordinary use actually looks like. These
 * observations exist to be counted, not to be read individually.
 *
 * Identifiers are therefore reduced to a digest salted with the UTC day. Counts
 * of requests per viewer and of distinct objects per viewer stay exact within a
 * day, while the log stops carrying a plain record of which member looked at
 * whose photo. The salt is the day rather than a secret: this is scoped
 * pseudonymisation for aggregation, not anonymity, and these logs already carry
 * request IP addresses.
 */
export function digestForDay(value: string, day: string) {
  return createHash("sha256").update(`${day}:${value}`).digest("hex").slice(0, 16);
}

export function utcDay(now: Date) {
  return now.toISOString().slice(0, 10);
}

export function buildMediaReadObservation(observation: MediaReadObservation, now: Date) {
  const day = utcDay(now);

  return {
    day,
    viewer: digestForDay(observation.viewerUserId, day),
    object: digestForDay(observation.objectKey, day),
    surface: observation.surface,
    revalidated: observation.revalidated
  };
}

/**
 * Observation only. This deliberately enforces nothing: the thresholds it will
 * eventually inform do not exist yet, and guessing them before measuring is how
 * you break ordinary members.
 */
export function recordMediaRead(
  logger: FastifyBaseLogger,
  observation: MediaReadObservation,
  now = new Date()
) {
  logger.info(buildMediaReadObservation(observation, now), "media read");
}
