import { parseResearchReport } from "@/lib/report-schema";
import { listReports, saveReport } from "@/lib/report-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const reports = await listReports();
    return Response.json(
      { reports },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Reports could not be loaded." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as unknown;
    const report = await saveReport(parseResearchReport(payload));
    return Response.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return Response.json(
        { error: "The report payload is invalid." },
        { status: 400 },
      );
    }

    return Response.json(
      { error: "The report could not be saved." },
      { status: 500 },
    );
  }
}
