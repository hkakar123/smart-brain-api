import express from 'express';
import bcrypt from 'bcrypt-nodejs';
import cors from 'cors';
import knex from 'knex';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import redis from 'redis';
import bodyParser from 'body-parser';

import { handleProfileGet } from './controllers/profile.js';
import { handleApiCall, handleImage } from './controllers/image.js';
import { requireAuth } from './controllers/authorization.js';

// -------------------- PostgreSQL Setup --------------------
const db = knex({
  client: 'pg',
  connection: process.env.POSTGRES_URI
});

// -------------------- Express Setup --------------------
const app = express();
app.use(morgan('combined'));
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET','POST','PUT'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// Set body-parser limits to handle large Base64 images
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// -------------------- Redis Setup --------------------
export const redisClient = redis.createClient(
  process.env.REDIS_PORT || 6379,
  process.env.REDIS_HOST || 'localhost'
);

redisClient.on('connect', () => console.log('✅ Redis connected'));
redisClient.on('error', (err) => console.error('Redis error:', err));

// -------------------- Auth Helpers --------------------
const signToken = (email) => jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '2 days' });

const setToken = (key, value, cb) => redisClient.set(key, value, cb);

const createSession = (user, res) => {
  const { email, id } = user;
  const token = signToken(email);
  setToken(token, id, (err) => {
    if(err) return res.status(500).json('Redis error storing session');
    return res.json({ success: 'true', userId: id, token });
  });
};

const getAuthTokenId = (req, res) => {
  const { authorization } = req.headers;
  if(!authorization) return res.status(401).json('Unauthorized');
  redisClient.get(authorization, (err, reply) => {
    if(err || !reply) return res.status(401).json('Unauthorized');
    return res.json({ id: reply });
  });
};

// -------------------- Signin --------------------
const handleSignin = (db, bcrypt, req, res) => {
  const { email, password } = req.body;
  if(!email || !password) return res.status(400).json('Incorrect form submission');

  db.select('email','hash').from('login')
    .where('email','=',email)
    .then(data => {
      if(data.length && bcrypt.compareSync(password, data[0].hash)){
        return db.select('*').from('users')
          .where('email','=',email)
          .then(user => {
            if(!user.length) return res.status(400).json('User not found');
            createSession(user[0], res);
          })
          .catch(() => res.status(400).json('Unable to get user'));
      } else {
        return res.status(400).json('Wrong credentials');
      }
    })
    .catch(() => res.status(400).json('Error logging in'));
};

const signinAuthentication = (db, bcrypt) => (req,res) => {
  const { authorization } = req.headers;
  if(authorization){
    return getAuthTokenId(req,res);
  } else {
    return handleSignin(db, bcrypt, req, res);
  }
};

// -------------------- Register --------------------
// Corrected POST /register route
app.post('/register', async (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !name || !password) return res.status(400).json('Incorrect form submission');

  // Check if email already exists
  const existingUser = await db('login').where({ email }).first();
  if (existingUser) {
    return res.status(400).json('Email already registered');
  }

  const hash = bcrypt.hashSync(password);

  try {
    const user = await db.transaction(async trx => {
      const loginEmail = await trx('login').insert({ hash, email }).returning('email');
      const userRows = await trx('users')
        .insert({ email: loginEmail[0].email, name, joined: new Date() })
        .returning('*');
      return userRows[0];
    });

    // Use createSession to send a token back to the frontend
    return createSession(user, res);

  } catch (err) {
    console.error('Registration error:', err); // Log the full error
    return res.status(500).json('Unable to register');
  }
});

// -------------------- Signin Route --------------------
app.post('/signin', signinAuthentication(db,bcrypt));

// -------------------- Profile Routes --------------------
app.get('/profile/:id', requireAuth, (req,res) => handleProfileGet(req,res,db));

// Update all fields including avatar
app.put('/profile/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, age, pet, avatar } = req.body;

  try {
    const updatedUser = await db('users')
      .where({ id })
      .update({
        name: name || undefined,
        age: age || undefined,
        pet: pet || undefined,
        avatar: avatar || undefined
      })
      .returning('*');

    if (!updatedUser.length) return res.status(404).json('User not found');

    return res.json(updatedUser[0]);
  } catch(err) {
    console.error(err);
    return res.status(500).json('Unable to update profile');
  }
});

// -------------------- Image Routes --------------------
app.post('/imageurl', requireAuth, (req,res) => handleApiCall(req,res));
app.put('/image', requireAuth, (req,res) => handleImage(req,res,db));

// Signout route
app.post('/signout', (req, res) => {
  const { authorization } = req.headers; // get token from headers
  if (!authorization) {
    return res.status(400).json('No token provided');
  }

  redisClient.del(authorization, (err, reply) => {
    if (err) {
      console.error('Redis error deleting session:', err);
      return res.status(500).json('Unable to sign out');
    }
    if (reply === 1) {
      return res.json({ success: true });
    } else {
      return res.status(400).json('Token not found');
    }
  });
});


db.raw('SELECT current_database(), current_user;')
  .then(data => console.log('Connected DB:', data.rows))
  .catch(err => console.error('DB connection error:', err));

// -------------------- Start Server --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
