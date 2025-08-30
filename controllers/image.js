import fetch from 'node-fetch';

export const handleApiCall = (req, res) => {
  const IMAGE_URL = req.body.input;

  if (!IMAGE_URL || IMAGE_URL.trim() === '') {
    return res.status(400).json('Image URL is empty.');
  }

  const PAT = '8158ad9295ec47778e04588636a7ead2';
  const USER_ID = 'afgkakar50';
  const APP_ID = 'FaceScanerApp';
  const MODEL_ID = 'face-detection';
  const MODEL_VERSION_ID = '6dc7e46bc9124c5c8824be4822abe105';

  const raw = JSON.stringify({
    user_app_id: {
      user_id: USER_ID,
      app_id: APP_ID
    },
    inputs: [
      {
        data: {
          image: {
            url: IMAGE_URL
          }
        }
      }
    ]
  });

  fetch(`https://api.clarifai.com/v2/models/${MODEL_ID}/versions/${MODEL_VERSION_ID}/outputs`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Key ${PAT}`
    },
    body: raw
  })
    .then(response => response.json())
    .then(data => res.json(data))
    .catch(err => {
      console.error('Clarifai API error:', err);
      res.status(400).json('Unable to work with API');
    });
};

export const handleImage = (req, res, db) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json('User ID is required.');
  }

  db('users')
    .where('id', '=', id)
    .increment('entries', 1)
    .returning('entries')
    .then(entries => {
      res.json(entries[0]);
    })
    .catch(err => {
      console.error('Database error:', err);
      res.status(400).json('Unable to get entries');
    });
};
