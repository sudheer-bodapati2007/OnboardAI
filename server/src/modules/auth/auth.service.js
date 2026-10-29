// src/modules/auth/auth.service.js
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { User } from '../../models/User.js';
import { Organization } from '../../models/Organization.js';
import { AppError } from '../../utils/AppError.js';

const googleClient = new OAuth2Client(env.googleClientId);

const SESSION_DURATION = 60 * 60 * 8; // 8 hours in seconds

/**
 * Verify Google ID token and return the payload.
 */
export async function verifyGoogleToken(idToken) {
  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.googleClientId,
    });
  } catch {
    throw new AppError('Invalid Google ID token', 401);
  }
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new AppError('Invalid Google token payload', 401);
  return payload;
}

/**
 * Find or create a user from a verified Google payload.
 * Role is NEVER taken from the client — it defaults to 'employee'.
 * The ADMIN_SEED_EMAIL env var allows the very first admin bootstrap.
 */
export async function findOrCreateUser(googlePayload) {
  const { sub: googleId, email, name, picture } = googlePayload;

  let user = await User.findOne({ googleId });

  if (user) {
    // Update mutable profile fields on every login
    user.email = email.toLowerCase();
    user.name = name;
    user.picture = picture ?? user.picture;
    await user.save();
    return user;
  }

  // New user — find or create a default org and assign role
  // In a real multi-org setup you would invite users to an org.
  // For Phase 1: each new HR admin seeds their own org; employees join via invite (simplified: same org).
  // Bootstrap: if ADMIN_SEED_EMAIL matches, first user gets hr_admin.

  let org = await Organization.findOne().sort({ createdAt: 1 });
  if (!org) {
    org = await Organization.create({ name: 'My Organization' });
  }

  const isAdminSeed =
    env.adminSeedEmail &&
    email.toLowerCase() === env.adminSeedEmail.toLowerCase() &&
    (await User.countDocuments({ role: 'hr_admin', organizationId: org._id })) === 0;

  user = await User.create({
    googleId,
    email: email.toLowerCase(),
    name,
    picture: picture ?? null,
    role: isAdminSeed ? 'hr_admin' : 'employee',
    organizationId: org._id,
    isActive: true,
  });

  return user;
}

/**
 * Issue a signed JWT and set it as HttpOnly cookie.
 */
export function issueSessionCookie(res, user) {
  const token = jwt.sign(
    { userId: user._id.toString(), role: user.role },
    env.jwtSecret,
    { expiresIn: SESSION_DURATION }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'strict' : 'lax',
    maxAge: SESSION_DURATION * 1000,
    path: '/',
  });

  return token;
}

export function clearSessionCookie(res) {
  res.clearCookie('token', {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'strict' : 'lax',
    path: '/',
  });
}

