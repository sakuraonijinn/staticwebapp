// functions/analytics.js
exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed',
    };
  }

  try {
    const data = JSON.parse(event.body);

    // Log the incoming data (replace with your storage logic)
    console.log('Received data:', JSON.stringify(data));

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'Data logged successfully' }),
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid data format' }),
    };
  }
};
};
