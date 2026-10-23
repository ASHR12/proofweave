import { getSessionFromRequest } from "@/lib/workspace-auth";
import { getInvoiceById } from "@/lib/workspace-billing";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; invoiceId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json(
      { error: "Workspace authentication is required." },
      { status: 401 },
    );
  }

  const { invoiceId } = await context.params;
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    return Response.json({ error: "Invoice not found." }, { status: 404 });
  }

  return Response.json(
    { invoice },
    { headers: { "Cache-Control": "no-store" } },
  );
}
