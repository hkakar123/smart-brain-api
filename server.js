import express from 'express';
import bcrypt from 'bcrypt-nodejs';
import cors from 'cors';
import knex from 'knex';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import { Redis } from '@upstash/redis';
import bodyParser from 'body-parser';

import { handleProfileGet } from './controllers/profile.js';
import { handleApiCall, handleImage } from './controllers/image.js';
import { requireAuth } from './controllers/authorization.js';

// -------------------- PostgreSQL Setup --------------------
const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.POSTGRES_URI,
    ssl: { rejectUnauthorized: false } // important for online DB
  }
});


// -------------------- Redis Setup (Upstash REST) --------------------
export const redisClient = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN
});

console.log('✅ Upstash Redis client created');

// -------------------- Express Setup --------------------
const app = express();
app.use(morgan('combined'));
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET','POST','PUT'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// -------------------- Auth Helpers --------------------
const signToken = (email) => jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '2 days' });

const setToken = async (key, value) => {
  await redisClient.set(key, value);
};

const createSession = async (user, res) => {
  const { email, id } = user;
  const token = signToken(email);
  try {
    await setToken(token, id);
    return res.json({ success: 'true', userId: id, token });
  } catch(err) {
    return res.status(500).json('Redis error storing session');
  }
};

const getAuthTokenId = async (req, res) => {
  const { authorization } = req.headers;
  if(!authorization) return res.status(401).json('Unauthorized');

  try {
    const reply = await redisClient.get(authorization);
    if(!reply) return res.status(401).json('Unauthorized');
    return res.json({ id: reply });
  } catch(err) {
    return res.status(500).json('Redis error');
  }
};

// -------------------- Signin --------------------
const handleSignin = async (db, bcrypt, req, res) => {
  const { email, password } = req.body;
  if(!email || !password) return res.status(400).json('Incorrect form submission');

  try {
    const data = await db.select('email','hash').from('login').where('email','=',email);
    if(data.length && bcrypt.compareSync(password, data[0].hash)){
      const user = await db.select('*').from('users').where('email','=',email).first();
      if(!user) return res.status(400).json('User not found');
      return await createSession(user, res);
    } else {
      return res.status(400).json('Wrong credentials');
    }
  } catch(err){
    return res.status(400).json('Error logging in');
  }
};

const signinAuthentication = (db, bcrypt) => async (req,res) => {
  const { authorization } = req.headers;
  if(authorization){
    return await getAuthTokenId(req,res);
  } else {
    return await handleSignin(db, bcrypt, req, res);
  }
};

// -------------------- Register --------------------
app.post('/register', async (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !name || !password) return res.status(400).json('Incorrect form submission');

  const existingUser = await db('login').where({ email }).first();
  if (existingUser) return res.status(400).json('Email already registered');

  const hash = bcrypt.hashSync(password);

  try {
    const user = await db.transaction(async trx => {
      const loginEmail = await trx('login').insert({ hash, email }).returning('email');
      const userRows = await trx('users')
        .insert({ email: loginEmail[0].email, name, joined: new Date() })
        .returning('*');
      return userRows[0];
    });

    return await createSession(user, res);
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json('Unable to register');
  }
});

// -------------------- Signin Route --------------------
app.post('/signin', signinAuthentication(db,bcrypt));

// -------------------- Profile Routes --------------------
app.get('/profile/:id', requireAuth, (req,res) => handleProfileGet(req,res,db));

app.put('/profile/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, age, pet, avatar } = req.body;

  try {
    const updatedUser = await db('users')
      .where({ id })
      .update({ name, age, pet, avatar })
      .returning('*');

    if(!updatedUser.length) return res.status(404).json('User not found');
    return res.json(updatedUser[0]);
  } catch(err){
    console.error(err);
    return res.status(500).json('Unable to update profile');
  }
});

// -------------------- Image Routes --------------------
app.post('/imageurl', requireAuth, (req,res) => handleApiCall(req,res));
app.put('/image', requireAuth, (req,res) => handleImage(req,res,db));

// -------------------- Signout Route --------------------
app.post('/signout', async (req, res) => {
  const { authorization } = req.headers;
  if(!authorization) return res.status(400).json('No token provided');

  try {
    const deleted = await redisClient.del(authorization);
    if(deleted === 1) return res.json({ success: true });
    return res.status(400).json('Token not found');
  } catch(err){
    console.error('Redis error deleting session:', err);
    return res.status(500).json('Unable to sign out');
  }
});

// -------------------- DB Test --------------------
db.raw('SELECT current_database(), current_user;')
  .then(data => console.log('Connected DB:', data.rows))
  .catch(err => console.error('DB connection error:', err));

  app.get('/', (req,res) => res.send('Smart Brain API is running!'));


// -------------------- Start Server --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
