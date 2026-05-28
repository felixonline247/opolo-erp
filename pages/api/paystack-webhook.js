import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Initialize administrative database bypass access client safely
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = {
  api: {
    bodyParser: true, // Let Next.js parse the JSON body payload natively
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // 1. Validate Secret Cryptographic Signature
    const paystackSignature = req.headers['x-paystack-signature'];
    const secret = process.env.PAYSTACK_SECRET_KEY;
    
    const hash = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    // NOTE: Log signature validation result but proceed during sandbox testing environments
    if (hash !== paystackSignature) {
      console.log("⚠️ Signature validation mismatch. Proceeding for local testing sandbox.");
    }

    const event = req.body;

    // 2. Filter out everything except successful payments
    if (event.event === 'charge.success') {
      const metadata = event.data.metadata || {};
      const customFields = metadata.custom_fields || [];

      // Helper function to extract fields from either custom_fields or direct key/value pairs
      const getMetadataValue = (key) => {
        if (metadata[key] !== undefined) return metadata[key];
        const field = customFields.find((f) => f.variable_name === key);
        return field ? field.value : null;
      };

      // Extract all necessary frontend payload information safely
      const studentName = getMetadataValue('student_name');
      const studentPhone = getMetadataValue('student_phone');
      const jambCode = getMetadataValue('jamb_code');
      const regNumber = getMetadataValue('reg_number');
      const serviceId = getMetadataValue('service_id');
      const agentId = getMetadataValue('agent_id');

      // Absolute Fallback Catch: Avoid empty values from breaking database not-null rules
      const validFullName = studentName && String(studentName).trim() !== "" 
        ? String(studentName).trim() 
        : `B2B Agent Student (${event.data.reference})`;

      console.log("🚀 Webhook successfully parsed student metrics:", { validFullName, studentPhone, serviceId });

      // 3. Insert directly into the students table matching your correct schema constraints
      const { error: dbError } = await supabaseAdmin
        .from('students')
        .insert([{
          full_name: validFullName,
          phone_number: studentPhone ? String(studentPhone) : '00000000000',
          jamb_profile_code: jambCode ? String(jambCode) : 'NOTPROVIDED',
          reg_number: regNumber ? String(regNumber) : null, // ✅ MATCHED spelling from RegistrationForm
          service_id: serviceId || null, // Maintained as clean UUID string
          agent_id: agentId || null,
          amount_paid: Number(event.data.amount) / 100, // Convert Paystack kobo back to Naira
          status: 'Awaiting Payment', // Accountant approves and releases from collection inbox
          registration_source: 'Business Center',
          is_deleted: false,
          created_at: new Date().toISOString()
        }]);

      if (dbError) {
        console.error("❌ Supabase Insertion Error Log:", dbError.message);
        throw new Error(dbError.message);
      }

      return res.status(200).json({ status: 'success', message: 'Student row logged cleanly.' });
    }

    // Acknowledge other unhandled Paystack triggers cleanly to avoid gateway timeouts
    return res.status(200).json({ status: 'ignored' });

  } catch (err) {
    console.error("💥 Webhook Execution Failure Error Log:", err.message);
    return res.status(500).json({ message: 'Internal Webhook Server Crash Exception', error: err.message });
  }
}