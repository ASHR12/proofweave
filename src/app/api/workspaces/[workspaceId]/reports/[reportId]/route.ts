import {
  deleteReport,
  getReport,
  ReportNotFoundError,
} from "@/lib/report-store";
import { getSessionFromRequest } from "@/lib/workspace-auth";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; reportId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json(
      { error: "Workspace authentication is required." },
      { status: 401 },
    );
  }

  const { reportId } = await context.params;

  try {
    const report = await getReport(reportId);
    return Response.json(
      { report, requestedBy: session.userId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ReportNotFoundError) {
      return Response.json({ error: "Report not found." }, { status: 404 });
    }
    return Response.json(
      { error: "Unable to load workspace report." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ workspaceId: string; reportId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json(
      { error: "Workspace authentication is required." },
      { status: 401 },
    );
  }

  const { reportId } = await context.params;

  try {
    await deleteReport(reportId);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof ReportNotFoundError) {
      return Response.json({ error: "Report not found." }, { status: 404 });
    }
    return Response.json(
      { error: "Unable to delete workspace report." },
      { status: 500 },
    );
  }
}
