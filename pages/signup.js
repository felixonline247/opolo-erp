import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'

export default function StaffSignup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const router = useRouter()

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const cleanEmail = email.toLowerCase().trim()

    // 🚀 STEP 1: Strict Invitation Guard Check
    // Verifies if the manager pre-registered the profile row inside Settings first
    const { data: existingProfile, error: checkError } = await supabase
      .from('profiles')
      .select('id, email, role')
      .eq('email', cleanEmail)
      .maybeSingle()

    if (checkError) {
      console.error("Database pre-check verification error:", checkError.message)
      setMessage({ type: 'error', text: 'Verification failed. Please check network connectivity and try again.' })
      setLoading(false)
      return
    }

    // 🛡️ SECURITY BLOCKER 1: Stop execution immediately if the email has not been added by a manager
    if (!existingProfile) {
      setMessage({ 
        type: 'error', 
        text: 'Access Denied: Your email has not been pre-registered by a manager.' 
      })
      setLoading(false)
      return
    }

    // 🛡️ SECURITY BLOCKER 2: Stop execution if the email was already claimed and onboarded
    if (existingProfile.id) {
      setMessage({ 
        type: 'error', 
        text: 'This account has already completed onboarding. Please go to the Login page.' 
      })
      setLoading(false)
      return
    }

    // 🚀 STEP 2: Authorized Account Registration
    // Only triggers if the whitelist validation constraints above clear perfectly
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password: password,
    })

    if (authError) {
      setMessage({ type: 'error', text: authError.message })
      setLoading(false)
      return
    }

    if (authData?.user) {
      // 🚀 STEP 3: Link Auth Session ID to Pre-Registered Profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ id: authData.user.id })
        .eq('email', cleanEmail)
      
      if (updateError) {
        console.error("Profile association linking matrix error:", updateError.message)
        setMessage({ type: 'error', text: 'Onboarding linking error: ' + updateError.message })
        setLoading(false)
        return
      }

      setMessage({ 
        type: 'success', 
        text: 'Signup successful! Profile linked successfully. Logging into your workstation...' 
      })
      
      // 🚀 STEP 4: Instant Workstation Onboarding Routing Layout (Email confirmations are OFF)
      // Routes them automatically based on the profile role configured by the manager
      setTimeout(() => {
        const role = existingProfile.role || 'Front Desk'
        if (role === 'Partner Agent') {
          router.push('/business-center')
        } else if (role === 'Supervisor' || role === 'Service Staff') {
          router.push('/service')
        } else {
          router.push('/dashboard')
        }
      }, 2000)
    } else {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl shadow-blue-900/10 p-10 border border-slate-100">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black text-blue-950 uppercase tracking-tighter">Staff Onboarding</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Opolo CBT Resort • 2026 Cycle</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-2 block">Official Email Address</label>
            <input 
              type="email" 
              className="w-full p-4 rounded-2xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-600 outline-none font-bold text-sm"
              placeholder="name@opolocbt.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-2 block">Create Password</label>
            <input 
              type="password" 
              className="w-full p-4 rounded-2xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-600 outline-none font-bold text-sm"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {message && (
            <div className={`p-4 rounded-xl text-xs font-bold uppercase tracking-wide ${message.type === 'error' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
              {message.text}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-950 text-white p-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-black transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50"
          >
            {loading ? 'Verifying Credentials...' : 'Create Staff Account'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <Link href="/" className="text-[10px] font-black text-slate-400 uppercase hover:text-blue-600 transition">
            Already have an account? Login Here
          </Link>
        </div>
      </div>
    </div>
  )
}