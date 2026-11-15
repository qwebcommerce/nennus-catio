import { vi } from "vitest";

/** What the fake device answers: a position, or an error code (1 blocked, 2 unavailable, 3 too slow). */
export type FakeAnswer = { latitude: number; longitude: number; accuracy: number } | { code: 1 | 2 | 3 };

/**
 * A fake `navigator.geolocation` for "Share my location" tests (D263): `getCurrentPosition` answers as
 * told, at once. Returns the spy, so a test can check it was asked (and with which options).
 */
export function fakeGeolocation(answer: FakeAnswer) {
  const getCurrentPosition = vi.fn((success: PositionCallback, failure?: PositionErrorCallback | null) => {
    if ("code" in answer) {
      failure?.({ code: answer.code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "" } as GeolocationPositionError);
      return;
    }
    success({ coords: { ...answer, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() } as GeolocationPosition);
  });
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
  return getCurrentPosition;
}

/** A browser without location at all. */
export function noGeolocation() {
  Object.defineProperty(navigator, "geolocation", { value: undefined, configurable: true });
}
