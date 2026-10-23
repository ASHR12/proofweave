import {
  issuePasswordRecoveryPin,
  resetPasswordWithRecoveryPin,
} from "@/lib/workspace-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const action = typeof payload.action === "string" ? payload.action : "";
    const email = typeof payload.email === "string" ? payload.email : "";

    if (!email) {
      return Response.json(
        { error: "Account email is required." },
        { status: 400 },
      );
    }

    if (action === "request-pin") {
      const result = await issuePasswordRecoveryPin(email);
      return Response.json(
        {
          issued: result.issued,
          recoveryPinPreview: result.recoveryPin,
        },
        { status: 200 },
      );
    }

    const recoveryPin =
      typeof payload.recoveryPin === "string" ? payload.recoveryPin : "";
    const newPassword =
      typeof payload.newPassword === "string" ? payload.newPassword : "";

    if (!recoveryPin || !newPassword) {
      return Response.json(
        { error: "Recovery PIN and new password are required." },
        { status: 400 },
      );
    }

    const updatedUser = await resetPasswordWithRecoveryPin(
      email,
      recoveryPin,
      newPassword,
    );
    if (!updatedUser) {
      return Response.json(
        { error: "Invalid recovery PIN or email." },
        { status: 400 },
      );
    }

    return Response.json({
      recovered: true,
      userId: updatedUser.id,
      workspaceId: updatedUser.workspaceId,
    });
  } catch {
    return Response.json(
      { error: "Password recovery failed." },
      { status: 500 },
    );
  }
}
