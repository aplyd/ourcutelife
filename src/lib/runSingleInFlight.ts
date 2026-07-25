export type InFlightRequestRef<T> = {
  current: Promise<T> | null;
};

export function runSingleInFlight<T>(
  requestRef: InFlightRequestRef<T>,
  request: () => Promise<T>,
): Promise<T> {
  if (requestRef.current) return requestRef.current;

  const promise = Promise.resolve()
    .then(request)
    .finally(() => {
      if (requestRef.current === promise) requestRef.current = null;
    });
  requestRef.current = promise;
  return promise;
}
