export interface ApiFetchOptions extends Omit<RequestInit, "credentials"> {
  handleErrors?: boolean;
  errorMessageKey?: string;
}

export interface ApiClientConfig {
  getApiBase: () => string;
  onError?: (path: string, status: number, message: string, errorMessageKey?: string) => void;
}

export function extractErrorMessage(bodyText: string): string {
  try {
    const json = JSON.parse(bodyText) as Record<string, unknown>;
    const err = json.error ?? json.message;
    if (typeof err === "string" && err.trim()) {
      if (err.trim().startsWith("{")) {
        const inner = JSON.parse(err) as Record<string, unknown>;
        const innerErr = inner.error ?? inner.message;
        if (typeof innerErr === "string" && innerErr.trim()) return innerErr.trim();
      }
      return err.trim();
    }
  } catch { /* not JSON */ }
  return bodyText;
}

export function createApiFetch(config: ApiClientConfig) {
  return async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
    const { handleErrors = true, errorMessageKey, ...init } = options;
    const base = config.getApiBase();
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, { ...init, credentials: "include" });

    if (!res.ok && handleErrors && config.onError) {
      const bodyText = await res.clone().text().catch(() => "");
      const message = extractErrorMessage(bodyText) || res.statusText || `HTTP ${res.status}`;
      config.onError(path, res.status, message, errorMessageKey);
    }

    return res;
  };
}
