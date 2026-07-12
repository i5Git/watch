import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import config from "./config.ts";

export type AppRole = "admin" | "user";

export interface AppUser {
  username: string;
  role: AppRole;
  disabled?: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

interface StoredUser extends AppUser {
  salt: string;
  passwordHash: string;
}

interface AuthStore {
  users: StoredUser[];
}

interface Session {
  user: AppUser;
  expiresAt: number;
}

declare global {
  namespace Express {
    interface Request {
      appUser?: AppUser;
    }
  }
}

const SESSION_COOKIE = "watch_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const sessionStore = new Map<string, Session>();

const resolveDataPath = (value: string) =>
  path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);

const authDirectory = resolveDataPath(String(config.AUTH_DATA_DIR || "data"));
const usersFile = path.join(authDirectory, "users.json");

const now = () => new Date().toISOString();

const ensureDirectory = () => {
  fs.mkdirSync(authDirectory, { recursive: true });
};

const readStore = (): AuthStore => {
  ensureDirectory();
  try {
    const parsed = JSON.parse(fs.readFileSync(usersFile, "utf8")) as AuthStore;
    if (Array.isArray(parsed?.users)) {
      return parsed;
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.warn("Unable to read auth store:", error);
    }
  }
  return { users: [] };
};

const writeStore = (store: AuthStore) => {
  ensureDirectory();
  const temporaryFile = `${usersFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(temporaryFile, usersFile);
};

const publicUser = (user: StoredUser): AppUser => {
  const { salt: _salt, passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
};

const hashPassword = (password: string, salt = crypto.randomBytes(16)) => ({
  salt: salt.toString("base64url"),
  passwordHash: crypto.scryptSync(password, salt, 64).toString("base64url"),
});

const verifyPassword = (
  password: string,
  salt: string,
  passwordHash: string,
) => {
  const expected = Buffer.from(passwordHash, "base64url");
  const actual = crypto.scryptSync(password, Buffer.from(salt, "base64url"), 64);
  return (
    expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  );
};

const makeStoredUser = (
  username: string,
  password: string,
  role: AppRole,
): StoredUser => {
  const timestamp = now();
  return {
    username,
    role,
    disabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...hashPassword(password),
  };
};

const cleanUsername = (value: unknown) => String(value ?? "").trim();

const validateUsername = (username: string) => {
  if (username.length < 2 || username.length > 64) {
    throw new Error("Username must be between 2 and 64 characters.");
  }
  if (!/^[\p{L}\p{N}._-]+$/u.test(username)) {
    throw new Error(
      "Username may only contain letters, numbers, dots, dashes, and underscores.",
    );
  }
};

const validatePassword = (password: string) => {
  if (password.length < 8 || password.length > 256) {
    throw new Error("Password must be between 8 and 256 characters.");
  }
};

export const ensureAuthStore = () => {
  const store = readStore();
  const adminUsername = cleanUsername(config.ADMIN_USERNAME || "admin");
  let admin = store.users.find((user) => user.username === adminUsername);
  if (!admin) {
    let adminPassword = String(config.ADMIN_PASSWORD || "");
    if (!adminPassword) {
      adminPassword = crypto.randomBytes(18).toString("base64url");
      console.warn(
        `No ADMIN_PASSWORD was configured. A one-time admin password was generated for "${adminUsername}": ${adminPassword}`,
      );
    }
    validateUsername(adminUsername);
    validatePassword(adminPassword);
    admin = makeStoredUser(adminUsername, adminPassword, "admin");
    store.users.push(admin);
    writeStore(store);
    return;
  }
  if (admin.role !== "admin" || admin.disabled) {
    admin.role = "admin";
    admin.disabled = false;
    admin.updatedAt = now();
    writeStore(store);
  }
};

const getStoredUser = (username: string) => {
  const store = readStore();
  return { store, user: store.users.find((item) => item.username === username) };
};

export const listManagedUsers = () =>
  readStore()
    .users.map(publicUser)
    .sort((left, right) => left.username.localeCompare(right.username));

export const createManagedUser = (
  usernameInput: unknown,
  passwordInput: unknown,
  roleInput: unknown = "user",
) => {
  const username = cleanUsername(usernameInput);
  const password = String(passwordInput ?? "");
  const role: AppRole = roleInput === "admin" ? "admin" : "user";
  validateUsername(username);
  validatePassword(password);
  const store = readStore();
  if (store.users.some((user) => user.username === username)) {
    throw new Error("A user with this username already exists.");
  }
  const user = makeStoredUser(username, password, role);
  store.users.push(user);
  writeStore(store);
  return publicUser(user);
};

export const updateManagedUser = (
  usernameInput: unknown,
  updates: { password?: unknown; disabled?: unknown },
) => {
  const username = cleanUsername(usernameInput);
  const { store, user } = getStoredUser(username);
  if (!user) {
    throw new Error("User not found.");
  }
  if (updates.password !== undefined) {
    const password = String(updates.password ?? "");
    validatePassword(password);
    Object.assign(user, hashPassword(password));
  }
  if (updates.disabled !== undefined) {
    user.disabled = Boolean(updates.disabled);
  }
  user.updatedAt = now();
  writeStore(store);
  for (const [token, session] of sessionStore) {
    if (session.user.username === username) {
      sessionStore.delete(token);
    }
  }
  return publicUser(user);
};

export const deleteManagedUser = (usernameInput: unknown) => {
  const username = cleanUsername(usernameInput);
  const adminUsername = cleanUsername(config.ADMIN_USERNAME || "admin");
  if (username === adminUsername) {
    throw new Error("The configured admin user cannot be deleted.");
  }
  const store = readStore();
  const previousLength = store.users.length;
  store.users = store.users.filter((user) => user.username !== username);
  if (store.users.length === previousLength) {
    throw new Error("User not found.");
  }
  writeStore(store);
  for (const [token, session] of sessionStore) {
    if (session.user.username === username) {
      sessionStore.delete(token);
    }
  }
};

export const login = (usernameInput: unknown, passwordInput: unknown) => {
  const username = cleanUsername(usernameInput);
  const password = String(passwordInput ?? "");
  const { store, user } = getStoredUser(username);
  if (
    !user ||
    user.disabled ||
    !verifyPassword(password, user.salt, user.passwordHash)
  ) {
    return undefined;
  }
  user.lastLoginAt = now();
  user.updatedAt = now();
  writeStore(store);
  const sessionToken = crypto.randomBytes(32).toString("base64url");
  const safeUser = publicUser(user);
  sessionStore.set(sessionToken, {
    user: safeUser,
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  });
  return { token: sessionToken, user: safeUser };
};

const parseCookie = (cookieHeader = "") =>
  cookieHeader.split(";").reduce<Record<string, string>>((cookies, part) => {
    const separator = part.indexOf("=");
    if (separator === -1) {
      return cookies;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});

export const getUserFromCookie = (cookieHeader?: string) => {
  const token = parseCookie(cookieHeader)[SESSION_COOKIE];
  if (!token) {
    return undefined;
  }
  const session = sessionStore.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessionStore.delete(token);
    return undefined;
  }
  return session.user;
};

export const getUserFromRequest = (request: Request) =>
  getUserFromCookie(request.headers.cookie);

const isSecureRequest = (request: Request) =>
  Boolean((request as Request & { secure?: boolean }).secure) ||
  Boolean(config.SSL_KEY_FILE && config.SSL_CRT_FILE);

export const setSessionCookie = (
  request: Request,
  response: Response,
  token: string,
) => {
  const secure = isSecureRequest(request) ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`,
  );
};

export const clearSessionCookie = (response: Response) => {
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
};

export const requireAuth = (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  const user = getUserFromRequest(request);
  if (!user) {
    response.status(401).json({ error: "authentication required" });
    return;
  }
  request.appUser = user;
  next();
};

export const requireAdmin = (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  const user = getUserFromRequest(request);
  if (!user) {
    response.status(401).json({ error: "authentication required" });
    return;
  }
  if (user.role !== "admin") {
    response.status(403).json({ error: "administrator access required" });
    return;
  }
  request.appUser = user;
  next();
};

export const getSessionCookieName = () => SESSION_COOKIE;
