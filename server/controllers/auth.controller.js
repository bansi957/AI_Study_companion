const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { generateToken } = require("../utils/jwt");
const apiResponse = require("../utils/apiResponse");
const { verifyFirebaseIdToken } = require("../config/firebase");
const {
  validateRegisterInput,
  validateLoginInput,
} = require("../validators/auth.validator");

const formatUserResponse = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  avatarUrl: user.avatarUrl || null,
});

const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    const validation = validateRegisterInput({ name, email, password });
    if (!validation.isValid) {
      return apiResponse(res, 400, validation.errors.join(", "));
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return apiResponse(res, 409, "Email is already registered");
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
    });

    const token = generateToken({ userId: newUser._id.toString() });

    return apiResponse(res, 201, "Registration successful", {
      user: formatUserResponse(newUser),
      token,
    });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    const validation = validateLoginInput({ email, password });
    if (!validation.isValid) {
      return apiResponse(res, 400, validation.errors.join(", "));
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return apiResponse(res, 401, "Invalid email or password");
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return apiResponse(res, 401, "Invalid email or password");
    }

    const token = generateToken({ userId: user._id.toString() });

    return apiResponse(res, 200, "Login successful", {
      user: formatUserResponse(user),
      token,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Verifies Firebase ID Token, locates or creates the MongoDB user, and returns an application JWT.
 * Never trusts client-sent user details.
 */
const googleAuth = async (req, res, next) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) {
      return apiResponse(res, 400, "Firebase ID token is required");
    }

    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch (err) {
      return apiResponse(res, 401, `Invalid or expired Firebase ID token: ${err.message}`);
    }

    const { uid, email, name, picture } = decoded;
    if (!email) {
      return apiResponse(res, 400, "Google account does not provide an email address");
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Try finding by firebaseUid
    let user = await User.findOne({ firebaseUid: uid });

    // 2. If not found by firebaseUid, try finding by email (legacy account link)
    if (!user) {
      user = await User.findOne({ email: normalizedEmail });
      if (user) {
        user.firebaseUid = uid;
        if (picture && !user.avatarUrl) {
          user.avatarUrl = picture;
        }
        await user.save();
      }
    }

    // 3. If still not found, create new MongoDB User
    if (!user) {
      const displayName = (name && name.trim()) || normalizedEmail.split("@")[0];
      user = await User.create({
        name: displayName,
        email: normalizedEmail,
        firebaseUid: uid,
        avatarUrl: picture || null,
        role: "user",
      });
    }

    // Generate standard backend JWT with user's MongoDB _id
    const token = generateToken({ userId: user._id.toString() });

    return apiResponse(res, 200, "Google authentication successful", {
      user: formatUserResponse(user),
      token,
    });
  } catch (error) {
    return next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return apiResponse(res, 401, "Authentication token required");
    }

    const user = await User.findById(userId).select("-passwordHash");
    if (!user) {
      return apiResponse(res, 401, "User not found");
    }

    return apiResponse(res, 200, "User profile retrieved successfully", {
      user: formatUserResponse(user),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  register,
  login,
  googleAuth,
  getMe,
};
