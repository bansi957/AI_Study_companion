const jwt = require("jsonwebtoken");

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured in environment variables");
  }
  return secret;
};

const generateToken = (payload, options = {}) => {
  const secret = getJwtSecret();
  const tokenPayload =
    typeof payload === "string" ? { userId: payload } : { ...payload };

  return jwt.sign(tokenPayload, secret, {
    expiresIn: options.expiresIn || "7d",
    ...options,
  });
};

const verifyToken = (token) => {
  const secret = getJwtSecret();
  return jwt.verify(token, secret);
};

module.exports = {
  generateToken,
  verifyToken,
  sign: generateToken,
  verify: verifyToken,
};
