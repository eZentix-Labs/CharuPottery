const jwt = require('jsonwebtoken');

// Short-lived access token
const generateAccessToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '15m',
  });
};

// Longer-lived refresh token
// `tv` (token version) lets logout / password change revoke refresh tokens.
const generateRefreshToken = (id, tokenVersion = 0) => {
  return jwt.sign({ id, tv: tokenVersion }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d',
  });
};

// Sends access token as httpOnly cookie + JSON response, refresh token as httpOnly cookie
const sendTokenResponse = (user, statusCode, res) => {
  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id, user.tokenVersion || 0);

  const cookieExpire = process.env.JWT_COOKIE_EXPIRE || 7;

  const cookieOptions = {
    expires: new Date(Date.now() + cookieExpire * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  };

  res
    .status(statusCode)
    .cookie('accessToken', accessToken, cookieOptions)
    .cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .json({
      success: true,
      accessToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
    });
};

module.exports = { generateAccessToken, generateRefreshToken, sendTokenResponse };
