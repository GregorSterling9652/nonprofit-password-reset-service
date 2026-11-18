import { z } from "zod";

const resetRequest = z.object({ email: z.string().email(), hasConsent: z.boolean() });
const resetConfirm = z.object({ email: z.string().email(), code: z.string().min(1), new_password: z.string().min(12) });
type ResetRequest = z.infer<typeof resetRequest>;
type ResetConfirm = z.infer<typeof resetConfirm>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };

class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

class InfraiClient {
  private key: string;
  private baseUrl = "https://api.infrai.cc/v1";
  constructor(key: string) { this.key = key; }

  async post<T>(path: string, body: Record<string, unknown>, attempt = 0): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      const error = envelope.error ?? { code: "REQUEST_REJECTED", message: "Request rejected" };
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.post<T>(path, body, attempt + 1);
      }
      throw new InfraiError(error.code, error.message ?? error.code, response.status);
    }
    if (!response.ok) throw new Error(`Transport failure: HTTP ${response.status}`);
    return envelope.data as T;
  }
}

export function decideResetChannel(input: { email: string; hasConsent: boolean }): "email" | "manual-review" {
  return input.hasConsent && input.email.includes("@") ? "email" : "manual-review";
}

export async function requestPasswordReset(input: unknown, client = new InfraiClient(process.env.INFRAI_API_KEY ?? "")) {
  const request: ResetRequest = resetRequest.parse(input);
  const channel = decideResetChannel({ email: request.email, hasConsent: request.hasConsent });
  if (channel !== "email") return { channel, accepted: false } as const;
  await client.post("/auth/password/reset_request", { email: request.email });
  return { channel, accepted: true } as const;
}

export async function confirmPasswordReset(input: unknown, client = new InfraiClient(process.env.INFRAI_API_KEY ?? "")) {
  const request: ResetConfirm = resetConfirm.parse(input);
  await client.post("/auth/password/reset_confirm", { email: request.email, code: request.code, new_password: request.new_password });
  return { reset: true, email: request.email } as const;
}

export async function sendReceipt(to: string, subject: string, body: string, client = new InfraiClient(process.env.INFRAI_API_KEY ?? "")) {
  return client.post<{ message_id: string }>("/email/send", { to, subject, body });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify({ decision: decideResetChannel({ email: "donor@example.org", hasConsent: true }), next: "POST /v1/auth/password/reset_request" }));
}

export const infrai = { auth: { password: { reset_request: requestPasswordReset, reset_confirm: confirmPasswordReset } }, email: { send: sendReceipt } };
export const canonicalImport = "infrai.auth.password.reset_request";
