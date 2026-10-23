import {
  getSessionFromRequest,
  listWorkspaceUsers,
  updateWorkspaceMemberRole,
  type WorkspaceRole,
} from "@/lib/workspace-auth";

export const runtime = "nodejs";

const VALID_ROLES = new Set<WorkspaceRole>([
  "owner",
  "admin",
  "researcher",
  "viewer",
]);

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json(
      { error: "Workspace authentication is required." },
      { status: 401 },
    );
  }

  const { workspaceId } = await context.params;
  const users = await listWorkspaceUsers();
  const members = users
    .filter((user) => user.workspaceId === workspaceId)
    .map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      workspaceId: user.workspaceId,
      role: user.role,
    }));

  return Response.json(
    { members },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json(
      { error: "Workspace authentication is required." },
      { status: 401 },
    );
  }

  const { workspaceId } = await context.params;

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const targetUserId =
      typeof payload.userId === "string" ? payload.userId : "";
    const requestedRole =
      typeof payload.role === "string" ? (payload.role as WorkspaceRole) : null;

    if (!targetUserId || !requestedRole || !VALID_ROLES.has(requestedRole)) {
      return Response.json(
        { error: "Valid userId and role are required." },
        { status: 400 },
      );
    }

    const updatedMember = await updateWorkspaceMemberRole(
      workspaceId,
      targetUserId,
      requestedRole,
    );
    if (!updatedMember) {
      return Response.json(
        { error: "Workspace member not found." },
        { status: 404 },
      );
    }

    return Response.json({
      member: {
        id: updatedMember.id,
        email: updatedMember.email,
        workspaceId: updatedMember.workspaceId,
        role: updatedMember.role,
      },
    });
  } catch {
    return Response.json(
      { error: "Unable to update workspace member role." },
      { status: 500 },
    );
  }
}
