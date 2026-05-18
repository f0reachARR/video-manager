import type { components, paths } from "./generated";

export type HealthResponse = components["schemas"]["HealthResponse"];
export type ErrorResponse = components["schemas"]["ErrorResponse"];

const BASE_URL = "/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ErrorResponse,
  ) {
    super(body.message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    let body: ErrorResponse = {
      code: "unknown",
      message: `HTTP ${res.status}`,
    };
    try {
      body = (await res.json()) as ErrorResponse;
    } catch {
      // keep fallback
    }
    throw new ApiError(res.status, body);
  }

  return (await res.json()) as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  type Resp =
    paths["/health"]["get"]["responses"]["200"]["content"]["application/json"];
  return request<Resp>("/health");
}

export function fetchReady(): Promise<HealthResponse> {
  type Resp =
    paths["/ready"]["get"]["responses"]["200"]["content"]["application/json"];
  return request<Resp>("/ready");
}
