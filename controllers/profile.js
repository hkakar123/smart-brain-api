// controllers/profile.js

export const handleProfileGet = (req, res, db) => {
  const { id } = req.params;
  db.select('*').from('users').where({ id })
    .then(user => {
      if (user.length) {
        res.json(user[0]);
      } else {
        res.status(404).json('User not found');
      }
    })
    .catch(err => {
      console.error('Error getting user:', err);
      res.status(400).json('Error getting user');
    });
};

export const handleProfileUpdate = (req, res, db) => {
  const { id } = req.params;
  const { name, age, pet, avatar } = req.body;

  console.log('Received profile update request:', { id, name, age, pet, avatar });

  // Build an object with only defined fields
  const updateFields = {};
  if (name !== undefined) updateFields.name = name;
  if (age !== undefined) updateFields.age = age;
  if (pet !== undefined) updateFields.pet = pet;
  if (avatar !== undefined) updateFields.avatar = avatar;

  if (Object.keys(updateFields).length === 0) {
    console.log('No fields to update');
    return res.status(400).json('No data provided to update');
  }

  console.log('Updating user with fields:', updateFields);

  db('users')
    .where({ id })
    .update(updateFields)
    .returning('*')
    .then(updatedUsers => {
      if (updatedUsers.length) {
        console.log('Update successful:', updatedUsers[0]);
        res.json(updatedUsers[0]); // send back updated user object
      } else {
        console.log('User not found for update:', id);
        res.status(404).json('User not found');
      }
    })
    .catch(err => {
      console.error('Error updating user:', err);
      res.status(500).json('Error updating user');
    });
};
