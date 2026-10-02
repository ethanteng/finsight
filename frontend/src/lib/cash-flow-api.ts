/** A signed-in request to the cash flow API: planned events and forecast adjustments. */
export async function sendCashFlowRequest(apiUrl: string, path: string, method: string, body?: unknown): Promise<Response> {
  const token = localStorage.getItem('auth_token');
  return fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
