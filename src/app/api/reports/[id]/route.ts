import {
  deleteReport,
  getReport,
  ReportNotFoundError,
} from "@/lib/report-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const report = await getReport(id);
    return Response.json(
      { report },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ReportNotFoundError) {
      return Response.json({ error: "Report not found." }, { status: 404 });
    }

    return Response.json(
      { error: "The report could not be loaded." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    await deleteReport(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof ReportNotFoundError) {
      return Response.json({ error: "Report not found." }, { status: 404 });
    }

    return Response.json(
      { error: "The report could not be deleted." },
      { status: 500 },
    );
  }
}
