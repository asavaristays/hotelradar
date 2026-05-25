DELETE FROM hotel_users
WHERE hotel_id IN (
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777'
);

DELETE FROM users
WHERE email IN (
  'rohet@radar.ai',
  'mayagarh@radar.ai',
  'jwild@radar.ai'
);

DELETE FROM hotels
WHERE city IN ('Jodhpur', 'Pushkar', 'Jawai');

DELETE FROM airfare_data
WHERE city IN ('Jodhpur', 'Pushkar', 'Jawai');

DELETE FROM holidays
WHERE city IN ('Jodhpur', 'Pushkar', 'Jawai');

DELETE FROM city_weights
WHERE city IN ('Jodhpur', 'Pushkar', 'Jawai');

DELETE FROM cities
WHERE name IN ('Jodhpur', 'Pushkar', 'Jawai');
