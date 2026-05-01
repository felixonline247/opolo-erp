import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/router';
import { logActivity } from '../lib/logger';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Authenticate with Supabase
      const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password: password,
      });

      if (authError) throw authError;

      if (user) {
        // 2. Log the activity for your audit trail
        await logActivity("Login", `${email} signed into the portal`);

        // 3. Fetch the user's role from the 'profiles' table
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error("Error fetching profile:", profileError.message);
          router.push('/dashboard'); // Fallback to main dashboard
          return;
        }

        // 4. Updated Smart Redirect Logic
        // Note: Casing must match your database (Service Staff)
        if (profile?.role === 'Manager') {
          router.push('/manager'); 
        } else if (profile?.role === 'Account' || profile?.role === 'Accountant') {
          router.push('/accounts'); 
        } else if (profile?.role === 'Service Staff') {
          router.push('/service'); // Explicit redirect for technical staff
        } else {
          router.push('/dashboard'); // Default for Front Desk / Others
        }
      }

    } catch (error) {
      alert("Login Failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-blue-900 p-10 text-center">
          <h1 className="text-white text-2xl font-black uppercase tracking-tighter leading-none">Opolo CBT Resort</h1>
          <p className="text-blue-300 text-[10px] font-bold uppercase tracking-widest mt-3">Staff Portal Login</p>
        </div>
        
        <form onSubmit={handleLogin} className="p-10 space-y-6">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Work Email</label>
            <input 
              type="email" 
              required 
              className="w-full px-4 py-4 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold text-blue-950"
              placeholder="name@opolocbt.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Password</label>
            <input 
              type="password" 
              required 
              className="w-full px-4 py-4 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold text-blue-950"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className={`w-full py-4 rounded-2xl text-white font-black uppercase tracking-[0.2em] text-[11px] transition-all shadow-xl ${
              loading ? 'bg-slate-400' : 'bg-blue-900 hover:bg-black active:scale-[0.98] shadow-blue-900/30'
            }`}
          >
            {loading ? "Authenticating..." : "Access Dashboard"}
          </button>
        </form>
        
        <div className="bg-slate-50 py-6 text-center border-t border-slate-100">
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
            Authorized Access Only • 2026 JAMB Cycle
          </p>
        </div>
      </div>
    </div>
  );
}