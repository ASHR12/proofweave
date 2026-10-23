import {
  authenticateWorkspaceUser,
  extractSessionToken,
  getSessionFromRequest,
} from "@/lib/workspace-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json(
      { error: "Authentication is required." },
      { status: 401 },
    );
  }

  return Response.json(
    { session },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const email = typeof payload.email === "string" ? payload.email : "";
    const password =
      typeof payload.password === "string" ? payload.password : "";
    const clientSessionId =
      typeof payload.sessionId === "string"
        ? payload.sessionId
        : extractSessionToken(request);

    if (!email || !password) {
      return Response.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    const session = await authenticateWorkspaceUser(
      email,
      password,
      clientSessionId,
    );
    if (!session) {
      return Response.json({ error: "Invalid credentials." }, { status: 401 });
    }

    return Response.json(
      { session },
      {
        status: 200,
        headers: {
          "Set-Cookie": `pw_session=${session.sessionId}; Path=/; HttpOnly; SameSite=Lax`,
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Unable to complete sign-in." },
      { status: 500 },
    );
  }
}
