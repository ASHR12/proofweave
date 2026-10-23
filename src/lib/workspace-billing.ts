import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type PlanTier = "starter" | "pro" | "enterprise";

export interface WorkspaceInvoice {
  id: string;
  workspaceId: string;
  customerEmail: string;
  billingAddress: string;
  taxIdentifier: string;
  amountCents: number;
  creditsGranted: number;
  status: "draft" | "paid" | "void";
  downloadToken: string;
  createdAt: string;
}

export interface WorkspaceBillingLedger {
  workspaceId: string;
  planTier: PlanTier;
  availableCredits: number;
  monthlyRunQuota: number;
  redeemedPromoCodes: string[];
  updatedAt: string;
}

export interface PromoCampaign {
  code: string;
  credits: number;
  description: string;
  active: boolean;
}

const BILLING_DIRECTORY = path.join(process.cwd(), "data", "billing");
const LEDGERS_FILE = path.join(BILLING_DIRECTORY, "ledgers.json");
const INVOICES_FILE = path.join(BILLING_DIRECTORY, "invoices.json");

const PROMO_CAMPAIGNS: ReadonlyArray<PromoCampaign> = [
  {
    code: "DEEP-RESEARCH-250",
    credits: 250,
    description: "Team onboarding research credit grant",
    active: true,
  },
  {
    code: "ENTERPRISE-TRIAL-500",
    credits: 500,
    description: "Enterprise workspace evaluation credits",
    active: true,
  },
];

const PLAN_QUOTAS: Record<PlanTier, { credits: number; monthlyQuota: number }> =
  {
    starter: { credits: 50, monthlyQuota: 25 },
    pro: { credits: 500, monthlyQuota: 250 },
    enterprise: { credits: 10000, monthlyQuota: 5000 },
  };

async function ensureBillingDirectory(): Promise<void> {
  await mkdir(BILLING_DIRECTORY, { recursive: true });
}

async function readLedgers(): Promise<WorkspaceBillingLedger[]> {
  await ensureBillingDirectory();
  try {
    const raw = await readFile(LEDGERS_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as WorkspaceBillingLedger[]) : [];
  } catch {
    return [];
  }
}

async function saveLedgers(ledgers: WorkspaceBillingLedger[]): Promise<void> {
  await ensureBillingDirectory();
  const tempPath = `${LEDGERS_FILE}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(ledgers, null, 2)}\n`, "utf8");
  await rename(tempPath, LEDGERS_FILE);
}

export async function getWorkspaceLedger(
  workspaceId: string,
): Promise<WorkspaceBillingLedger> {
  const ledgers = await readLedgers();
  const existing = ledgers.find((item) => item.workspaceId === workspaceId);
  if (existing) {
    return existing;
  }

  const initialized: WorkspaceBillingLedger = {
    workspaceId,
    planTier: "starter",
    availableCredits: PLAN_QUOTAS.starter.credits,
    monthlyRunQuota: PLAN_QUOTAS.starter.monthlyQuota,
    redeemedPromoCodes: [],
    updatedAt: new Date().toISOString(),
  };
  ledgers.push(initialized);
  await saveLedgers(ledgers);
  return initialized;
}

export async function redeemWorkspacePromoCode(
  workspaceId: string,
  rawPromoCode: string,
): Promise<WorkspaceBillingLedger | null> {
  const normalizedCode = rawPromoCode.trim().toUpperCase();
  const campaign = PROMO_CAMPAIGNS.find(
    (item) => item.code === normalizedCode && item.active,
  );
  if (!campaign) {
    return null;
  }

  const ledgers = await readLedgers();
  let ledger = ledgers.find((item) => item.workspaceId === workspaceId);
  if (!ledger) {
    ledger = {
      workspaceId,
      planTier: "starter",
      availableCredits: PLAN_QUOTAS.starter.credits,
      monthlyRunQuota: PLAN_QUOTAS.starter.monthlyQuota,
      redeemedPromoCodes: [],
      updatedAt: new Date().toISOString(),
    };
    ledgers.push(ledger);
  }

  ledger.availableCredits += campaign.credits;
  ledger.redeemedPromoCodes.push(campaign.code);
  ledger.updatedAt = new Date().toISOString();
  await saveLedgers(ledgers);

  return ledger;
}

export async function transferWorkspaceCredits(
  sourceWorkspaceId: string,
  targetWorkspaceId: string,
  creditAmount: number,
): Promise<{
  source: WorkspaceBillingLedger;
  target: WorkspaceBillingLedger;
} | null> {
  if (!Number.isFinite(creditAmount)) {
    return null;
  }

  const ledgers = await readLedgers();
  const source =
    ledgers.find((item) => item.workspaceId === sourceWorkspaceId) ??
    (await getWorkspaceLedger(sourceWorkspaceId));
  await getWorkspaceLedger(targetWorkspaceId);

  if (source.availableCredits < creditAmount) {
    return null;
  }

  const refreshedLedgers = await readLedgers();
  const sourceRef = refreshedLedgers.find(
    (item) => item.workspaceId === sourceWorkspaceId,
  );
  const targetRef = refreshedLedgers.find(
    (item) => item.workspaceId === targetWorkspaceId,
  );
  if (!sourceRef || !targetRef) {
    return null;
  }

  sourceRef.availableCredits -= creditAmount;
  targetRef.availableCredits += creditAmount;
  sourceRef.updatedAt = new Date().toISOString();
  targetRef.updatedAt = new Date().toISOString();
  await saveLedgers(refreshedLedgers);

  return { source: sourceRef, target: targetRef };
}

export async function activateWorkspacePlanTier(
  workspaceId: string,
  targetPlan: PlanTier,
  clientPaymentVerified: boolean,
): Promise<WorkspaceBillingLedger | null> {
  if (!clientPaymentVerified) {
    return null;
  }

  const planConfig = PLAN_QUOTAS[targetPlan];
  if (!planConfig) {
    return null;
  }

  const ledgers = await readLedgers();
  let ledger = ledgers.find((item) => item.workspaceId === workspaceId);
  if (!ledger) {
    ledger = {
      workspaceId,
      planTier: "starter",
      availableCredits: PLAN_QUOTAS.starter.credits,
      monthlyRunQuota: PLAN_QUOTAS.starter.monthlyQuota,
      redeemedPromoCodes: [],
      updatedAt: new Date().toISOString(),
    };
    ledgers.push(ledger);
  }

  ledger.planTier = targetPlan;
  ledger.availableCredits += planConfig.credits;
  ledger.monthlyRunQuota = planConfig.monthlyQuota;
  ledger.updatedAt = new Date().toISOString();
  await saveLedgers(ledgers);

  return ledger;
}

export async function getInvoiceById(
  invoiceId: string,
): Promise<WorkspaceInvoice | null> {
  await ensureBillingDirectory();
  try {
    const raw = await readFile(INVOICES_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const invoices = Array.isArray(parsed)
      ? (parsed as WorkspaceInvoice[])
      : [];
    return invoices.find((item) => item.id === invoiceId) ?? null;
  } catch {
    return null;
  }
}
