// Mints a short-lived Speechmatics Realtime JWT. The API key never leaves the server;
// the browser connects to wss://global.rt.speechmatics.com/v2?jwt=<token>.

export async function POST() {
  const apiKey = process.env.SPEECHMATICS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Speechmatics API key is not configured on the server." },
      { status: 503 },
    );
  }

  const res = await fetch("https://mp.speechmatics.com/v1/api_keys?type=rt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ ttl: 120 }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return Response.json(
      { error: `Speechmatics token mint failed (${res.status}).`, detail: detail.slice(0, 300) },
      { status: 502 },
    );
  }

  const data = (await res.json()) as { key_value?: string };
  if (!data.key_value) {
    return Response.json({ error: "Token response missing key_value." }, { status: 502 });
  }
  return Response.json({ jwt: data.key_value });
}
