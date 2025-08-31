// controllers/authorization.js
import { redisClient } from "../server.js";

export const requireAuth = async (req, res, next) => {
  const { authorization } = req.headers;
  if (!authorization) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const userId = await redisClient.get(authorization);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    req.userId = userId;
    console.log('✅ Authorized user:', userId);
    return next();
  } catch (err) {
    console.error('Redis error:', err);
    return res.status(500).json({ error: 'Redis error' });
  }
};
