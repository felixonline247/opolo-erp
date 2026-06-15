import { createClient } from '@supabase/supabase-js'

// Privileged Admin client bypassing Row Level Security
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Ensure this key is defined in your .env.local file
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method execution protocol not allowed.' })
  }

  const { auth_user_id, new_password } = req.body

  // Security Protection Guardrails
  if (!auth_user_id || !new_password) {
    return res.status(400).json({ message: 'Missing parameters. User identity and a password are required.' })
  }

  if (new_password.length < 6) {
    return res.status(400).json({ message: 'Security Denied: Password must be at least 6 characters long.' })
  }

  try {
    // Invoke Supabase Auth Admin Management tools to overwrite credentials directly by user ID
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      auth_user_id,
      { password: new_password }
    )

    if (error) throw error

    return res.status(200).json({ message: 'Password updated successfully! Staff member can now log in with their new password.' })
  } catch (err) {
    console.error('Admin Password Reset Engine Failure:', err.message)
    return res.status(500).json({ message: 'Auth Master Override Error: ' + err.message })
  }
}