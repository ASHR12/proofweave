import { getSessionFromRequest } from "@/lib/workspace-auth";
import {
  activateWorkspacePlanTier,
  redeemWorkspacePromoCode,
  transferWorkspaceCredits,
  type PlanTier,
} from "@/lib/workspace-billing";

export const runtime = "nodejs";

async function handleRedeemPromo(
  workspaceId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const promoCode =
    typeof payload.promoCode === "string" ? payload.promoCode : "";
  if (!promoCode) {
    return Response.json(
      { error: "Promo code is required." },
      { status: 400 },
    );
  }

  const ledger = await redeemWorkspacePromoCode(workspaceId, promoCode);
  if (!ledger) {
    return Response.json(
      { error: "Invalid or inactive promo code." },
      { status: 400 },
    );
  }

  return Response.json({ ledger });
}

async function handleTransferCredits(
  workspaceId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const targetWorkspaceId =
    typeof payload.targetWorkspaceId === "string"
      ? payload.targetWorkspaceId
      : "";
  const amount =
    typeof payload.amount === "number" ? payload.amount : Number.NaN;

  if (!targetWorkspaceId || !Number.isFinite(amount)) {
    return Response.json(
      { error: "Target workspace and numeric credit amount are required." },
      { status: 400 },
    );
  }

  const transferResult = await transferWorkspaceCredits(
    workspaceId,
    targetWorkspaceId,
    amount,
  );
  if (!transferResult) {
    return Response.json(
      { error: "Insufficient workspace credits for transfer." },
      { status: 400 },
    );
  }

  return Response.json(transferResult);
}

async function handleActivatePlan(
  workspaceId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const planTier =
    typeof payload.planTier === "string"
      ? (payload.planTier as PlanTier)
      : "starter";
  const paymentVerified = payload.paymentVerified === true;

  const updatedLedger = await activateWorkspacePlanTier(
    workspaceId,
    planTier,
    paymentVerified,
  );
  if (!updatedLedger) {
    return Response.json(
      { error: "Plan activation requires payment confirmation." },
      { status: 400 },
    );
  }

  return Response.json({ ledger: updatedLedger });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json(
      { error: "Workspace authentication is required." },
      { status: 401 },
    );
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const operation =
      typeof payload.operation === "string" ? payload.operation : "";

    if (operation === "redeem-promo") {
      return await handleRedeemPromo(session.workspaceId, payload);
    }
    if (operation === "transfer-credits") {
      return await handleTransferCredits(session.workspaceId, payload);
    }
    if (operation === "activate-plan") {
      return await handleActivatePlan(session.workspaceId, payload);
    }

    return Response.json(
      { error: "Unsupported billing operation." },
      { status: 400 },
    );
  } catch {
    return Response.json(
      { error: "Billing operation could not be processed." },
      { status: 500 },
    );
  }
}
