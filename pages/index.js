import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Automatically redirect anyone who visits http://localhost:3001/ to /login
    // This ensures your activity logging in pages/login.js is always used.
    router.push('/login')
  }, [router])

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sans">
      <div className="text-center">
        {/* Simple loader while the redirect happens */}
        <div className="w-12 h-12 border-4 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <h2 className="text-white text-xl font-black uppercase tracking-tighter italic">
          Opolo CBT Resort
        </h2>
        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-2">
          Redirecting to Staff Portal...
        </p>
      </div>
    </div>
  )
}