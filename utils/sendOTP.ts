import axios from 'axios';

export const sendOTP = async (phoneNumber: string, otp: string): Promise<void> => {
  try {
    const apiKey = process.env.TERMII_API_KEY;
    const sender = process.env.TERMII_SENDER_ID;
    const message = `Your OTP is: ${otp}. Valid for 10 minutes.`;

    const data = {
      to: phoneNumber, 
      from: sender,
      sms: message,
      type: "plain",
      api_key: apiKey,
      channel: "generic",
    };

    const response = await axios.post('https://v3.api.termii.com/api/sms/send', data, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('SMS sent successfully:', response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error sending SMS:', error.response?.data || error.message);
    } else {
      console.error('Error sending SMS:', error);
    }
    throw new Error('Failed to send OTP');
  }
};

export const sendSMS = async (phoneNumber: string): Promise<void> => {
  try {
    const apiKey = process.env.TERMII_API_KEY;
    const sender = process.env.TERMII_SENDER_ID;
    const message = 'Your password reset was successful.';
    const data = {
      to: phoneNumber,
      from: sender,
      sms: message,
      type: "plain",
      api_key: apiKey,
      channel: "generic", 
    };

    const response = await axios.post('https://v3.api.termii.com/api/sms/send', data, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('SMS sent successfully:', response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error sending SMS:', error.response?.data || error.message);
    } else {
      console.error('Error sending SMS:', error);
    }
    throw new Error('Failed to send OTP');
  }
};


