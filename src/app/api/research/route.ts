import {
  discoverLatestResearchRun,
  ResearchAlreadyRunningError,
  startResearchRun,
} from "@/lib/research-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(
      { run: await discoverLatestResearchRun() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Unable to discover persisted research runs." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const question =
      typeof payload.question === "string" ? payload.question.trim() : "";
    const scope = typeof payload.scope === "string" ? payload.scope.trim() : "";

    if (!question || question.length > 4_000) {
      return Response.json(
        { error: "Enter a research question under 4,000 characters." },
        { status: 400 },
      );
    }
    if (scope.length > 8_000) {
      return Response.json(
        { error: "Scope and instructions must be under 8,000 characters." },
        { status: 400 },
      );
    }
    if (payload.confirmedPaidPreview !== true) {
      return Response.json(
        { error: "Paid preview confirmation is required." },
        { status: 400 },
      );
    }

    const run = await startResearchRun(question, scope);
    return Response.json({ run }, { status: 202 });
  } catch (error) {
    if (error instanceof ResearchAlreadyRunningError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      { error: "Unable to start the research run." },
      { status: 500 },
    );
  }
}
