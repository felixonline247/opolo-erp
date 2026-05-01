export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { to, sms } = req.body;
  const TERMII_API_KEY = TLrDSFMHEzuDokfUMVhYwCmuhZJAKnXCzFRKduxubuFWpyxbncVgTYZFfCQrHL; // Put your key here

  try {
    const response = await fetch('https://api.ng.termii.com/api/sms/send/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TERMII_API_KEY,
        to: to, // This is the array of numbers from the frontend
        from: "OpoloCBT", // Your registered Sender ID on Termii
        sms: sms,
        type: "plain",
        channel: "generic"
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      return res.status(200).json(data);
    } else {
      return res.status(400).json({ error: data.message || "Termii API Error" });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}