// src/modules/auth/auth.controller.js
import * as AuthService from './auth.service.js';
import { success } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';

export async function googleLogin(req, res, next) {
  try {
    const { idToken } = req.body;
    if (!idToken) return next(new AppError('idToken is required', 400));

    const googlePayload = await AuthService.verifyGoogleToken(idToken);
    const user = await AuthService.findOrCreateUser(googlePayload);

    if (!user.isActive) {
      return next(new AppError('Your account has been deactivated', 403));
    }

    AuthService.issueSessionCookie(res, user);

    return success(res, {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
        organizationId: user.organizationId,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req, res, next) {
  try {
    return success(res, {
      user: {
        id: req.user._id,
        email: req.user.email,
        name: req.user.name,
        picture: req.user.picture,
        role: req.user.role,
        organizationId: req.user.organizationId,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    AuthService.clearSessionCookie(res);
    return success(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

