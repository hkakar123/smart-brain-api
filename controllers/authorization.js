import { redisClient } from "../server.js";

export const requireAuth = (req, res, next) => {
  const { authorization } = req.headers;
  if (!authorization) {
    return res.status(401).json({ error: 'Unauthorized' }); // send JSON
  }

  redisClient.get(authorization, (err, reply) => {
    if (err || !reply) {
      return res.status(401).json({ error: 'Unauthorized' }); // send JSON
    }

    console.log('✅ you shall pass');
    req.userId = reply; // optional: attach userId
    return next();
  });
};
