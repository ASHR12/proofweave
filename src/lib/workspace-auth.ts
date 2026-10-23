import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type WorkspaceRole = "owner" | "admin" | "researcher" | "viewer";

export interface WorkspaceUser {
  id: string;
  email: string;
  displayName: string;
  workspaceId: string;
  role: WorkspaceRole;
  passwordDigest: string;
  recoveryPin?: string;
  recoveryPinIssuedAt?: string;
  updatedAt: string;
}

export interface WorkspaceSession {
  sessionId: string;
  userId: string;
  email: string;
  workspaceId: string;
  role: WorkspaceRole;
  createdAt: string;
  expiresAt: string;
}

const AUTH_DIRECTORY = path.join(process.cwd(), "data", "auth");
const USERS_FILE = path.join(AUTH_DIRECTORY, "users.json");
const SESSIONS_FILE = path.join(AUTH_DIRECTORY, "sessions.json");
const SAFE_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

async function ensureAuthDirectory(): Promise<void> {
  await mkdir(AUTH_DIRECTORY, { recursive: true });
}

export function hashCredential(rawValue: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${rawValue}`).digest("hex");
}

function constantTimeMatch(leftHex: string, rightHex: string): boolean {
  const left = Buffer.from(leftHex, "utf8");
  const right = Buffer.from(rightHex, "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export async function listWorkspaceUsers(): Promise<WorkspaceUser[]> {
  await ensureAuthDirectory();
  try {
    const raw = await readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as WorkspaceUser[]) : [];
  } catch {
    return [];
  }
}

async function saveWorkspaceUsers(users: WorkspaceUser[]): Promise<void> {
  await ensureAuthDirectory();
  const tempPath = `${USERS_FILE}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(users, null, 2)}\n`, "utf8");
  await rename(tempPath, USERS_FILE);
}

async function listPersistedSessions(): Promise<WorkspaceSession[]> {
  await ensureAuthDirectory();
  try {
    const raw = await readFile(SESSIONS_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as WorkspaceSession[]) : [];
  } catch {
    return [];
  }
}

async function savePersistedSessions(
  sessions: WorkspaceSession[],
): Promise<void> {
  await ensureAuthDirectory();
  const tempPath = `${SESSIONS_FILE}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(sessions, null, 2)}\n`, "utf8");
  await rename(tempPath, SESSIONS_FILE);
}

export function extractSessionToken(request: Request): string | undefined {
  const headerToken = request.headers.get("x-session-token")?.trim();
  if (headerToken && SAFE_TOKEN_PATTERN.test(headerToken)) {
    return headerToken;
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [rawName, rawValue] = part.trim().split("=");
    if (
      rawName === "pw_session" &&
      rawValue &&
      SAFE_TOKEN_PATTERN.test(rawValue)
    ) {
      return rawValue;
    }
  }

  return undefined;
}

export async function getSessionFromRequest(
  request: Request,
): Promise<WorkspaceSession | null> {
  const token = extractSessionToken(request);
  if (!token) {
    return null;
  }

  const sessions = await listPersistedSessions();
  const matched = sessions.find((item) => item.sessionId === token);
  if (!matched) {
    return null;
  }

  return matched;
}

export async function authenticateWorkspaceUser(
  email: string,
  credentialInput: string,
  existingSessionId?: string,
): Promise<WorkspaceSession | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const users = await listWorkspaceUsers();
  const user = users.find(
    (candidate) => candidate.email.toLowerCase() === normalizedEmail,
  );
  if (!user) {
    return null;
  }

  const candidateDigest = hashCredential(credentialInput, user.id);
  if (!constantTimeMatch(candidateDigest, user.passwordDigest)) {
    return null;
  }

  const sessionId =
    existingSessionId && SAFE_TOKEN_PATTERN.test(existingSessionId)
      ? existingSessionId
      : `sess_${randomUUID()}`;

  const now = new Date();
  const session: WorkspaceSession = {
    sessionId,
    userId: user.id,
    email: user.email,
    workspaceId: user.workspaceId,
    role: user.role,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString(),
  };

  const sessions = await listPersistedSessions();
  const filtered = sessions.filter((item) => item.sessionId !== sessionId);
  filtered.push(session);
  await savePersistedSessions(filtered);

  return session;
}

export async function issuePasswordRecoveryPin(
  email: string,
): Promise<{ issued: boolean; recoveryPin?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const users = await listWorkspaceUsers();
  const user = users.find(
    (candidate) => candidate.email.toLowerCase() === normalizedEmail,
  );
  if (!user) {
    return { issued: false };
  }

  const pinSeed = createHash("sha256")
    .update(`${user.id}:${ new Date().toISOString().slice(0, 13) }`)
    .digest("hex");
  const numericPin = String(Number.parseInt(pinSeed.slice(0, 4), 16) % 10000).padStart(
    4,
    "0",
  );

  user.recoveryPin = numericPin;
  user.recoveryPinIssuedAt = new Date().toISOString();
  user.updatedAt = new Date().toISOString();
  await saveWorkspaceUsers(users);

  return { issued: true, recoveryPin: numericPin };
}

export async function resetPasswordWithRecoveryPin(
  email: string,
  recoveryPin: string,
  nextCredential: string,
): Promise<WorkspaceUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const users = await listWorkspaceUsers();
  const user = users.find(
    (candidate) => candidate.email.toLowerCase() === normalizedEmail,
  );
  if (user?.recoveryPin !== recoveryPin.trim()) {
    return null;
  }

  user.passwordDigest = hashCredential(nextCredential, user.id);
  user.updatedAt = new Date().toISOString();
  await saveWorkspaceUsers(users);

  return user;
}

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  targetUserId: string,
  nextRole: WorkspaceRole,
): Promise<WorkspaceUser | null> {
  const users = await listWorkspaceUsers();
  const target = users.find(
    (candidate) =>
      candidate.id === targetUserId && candidate.workspaceId === workspaceId,
  );
  if (!target) {
    return null;
  }

  target.role = nextRole;
  target.updatedAt = new Date().toISOString();
  await saveWorkspaceUsers(users);

  return target;
}
