export async function sendCompletionSMS(phone, name) {
  const apiKey = process.env.NEXT_PUBLIC_TERMII_API_KEY;
  
  // Clean phone number: remove '+' or ensure it starts with 234
  const cleanPhone = phone.startsWith('0') ? '234' + phone.substring(1) : phone;

  const payload = {
    to: cleanPhone,
    from: "OpoloCBT", // MUST match your approved Termii Sender ID
    sms: `Hello ${name}, your registration at Opolo CBT Resort is now COMPLETED. Thank you for choosing us!`,
    type: "plain",
    channel: "generic",
    api_key: apiKey,
  };

  try {
    const response = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await response.json();
  } catch (error) {
    console.error("Termii Error:", error);
  }
}