import {
  getResearchRun,
  ResearchRunNotFoundError,
} from "@/lib/research-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return Response.json({ run: await getResearchRun(id) });
  } catch (error) {
    if (error instanceof ResearchRunNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json(
      { error: "Unable to read the research run." },
      { status: 500 },
    );
  }
}
