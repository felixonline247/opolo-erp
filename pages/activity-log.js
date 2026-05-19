import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient'; 
import Link from 'next/link';

export default function StaffActivityLog() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [filterDate, setFilterDate] = useState('');

  // 1. Authenticate and verify Service Staff Role
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user: authUser }, error } = await supabase.auth.getUser();
      
      if (error || !authUser) {
        window.location.href = '/';
        return;
      }

      // Fetch profile to verify role
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', authUser.id)
        .single();

      // Allowed Roles matching your exact database schema
      const allowedRoles = ['Staff', 'Service Staff', 'Manager', 'Admin', 'Account'];
      if (profileError || !allowedRoles.includes(profile?.role)) {
        window.location.href = '/unauthorized';
        return;
      }

      setUser(profile);
      fetchJobs(profile.id, filterDate);
    };

    checkAuth();
  }, [filterDate]);

  // 2. Fetch completed/started jobs with required nested relation
  const fetchJobs = async (userId, dateStr) => {
    setLoading(true);
    try {
      // Added staff_commission to the select query
      let query = supabase
        .from('students')
        .select(`
          id, 
          full_name,
          status, 
          amount_paid, 
          institution_cost,
          staff_commission,
          completed_at,
          services (
            id,
            service_name,
            commission_type, 
            commission_value
          )
        `)
        // Filter tasks started OR completed by this specific staff member
        .or(`started_by.eq.${userId},completed_by.eq.${userId}`)
        .in('status', ['Started', 'Completed'])
        .order('completed_at', { ascending: false });

      // Apply date filter if selected
      if (dateStr) {
        query = query
          .gte('completed_at', `${dateStr}T00:00:00`)
          .lte('completed_at', `${dateStr}T23:59:59`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Error fetching activity log:', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 text-blue-950 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Header Area */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
          <div>
            <div className="mb-2">
              <Link href="/service">
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-900 bg-white border-2 border-blue-950 px-3 py-1 rounded-md cursor-pointer hover:bg-slate-100 transition-colors">
                  ← Back to Station
                </span>
              </Link>
            </div>
            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-blue-950 italic">
              Activity Log
            </h1>
            <p className="text-xs font-black uppercase tracking-widest text-blue-500 mt-1">
              Service Staff Performance History
            </p>
          </div>

          {/* Neo-brutalist Date Filter Controls */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase tracking-widest text-blue-950">
              Filter By Date
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="px-4 py-3 bg-white border-4 border-blue-950 rounded-[1rem] font-black text-blue-950 focus:outline-none shadow-[4px_4px_0px_0px_rgba(26,54,93,1)] transition-all"
              />
              {filterDate && (
                <button
                  onClick={() => setFilterDate('')}
                  className="px-4 py-3 bg-blue-500 text-white border-4 border-blue-950 rounded-[1rem] font-black uppercase text-xs tracking-widest shadow-[4px_4px_0px_0px_rgba(26,54,93,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(26,54,93,1)] transition-all"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Log Card Container */}
        <div className="bg-white border-4 border-blue-950 rounded-[2.5rem] p-6 md:p-10 shadow-[8px_8px_0px_0px_rgba(26,54,93,1)]">
          {loading ? (
            <div className="text-center py-12 font-black uppercase tracking-widest text-blue-500 animate-pulse">
              Loading Logs...
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-xl font-black uppercase tracking-tighter text-blue-950">
                No matching jobs found
              </p>
              <p className="text-xs font-black uppercase tracking-widest text-blue-500 mt-2">
                Try adjusting your date filters or handle queue items.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-4 border-blue-950">
                    <th className="pb-4 text-xs font-black uppercase tracking-widest text-blue-950">Student / ID</th>
                    <th className="pb-4 text-xs font-black uppercase tracking-widest text-blue-950">Service Type</th>
                    <th className="pb-4 text-xs font-black uppercase tracking-widest text-blue-950">Inst. Cost</th>
                    <th className="pb-4 text-xs font-black uppercase tracking-widest text-blue-950">Commission</th>
                    <th className="pb-4 text-xs font-black uppercase tracking-widest text-blue-950">Date Handled</th>
                    <th className="pb-4 text-xs font-black uppercase tracking-widest text-blue-950">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-200">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4">
                        <span className="font-black tracking-tight text-lg text-blue-950 block uppercase italic">
                          {job.full_name || 'Walk-in Student'}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mt-0.5">
                          ID: #{job.id.slice(0, 8)}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className="font-black uppercase tracking-tight text-sm text-blue-950 block">
                          {job.services?.service_name || 'Unknown Service'}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className="font-black text-sm text-red-500 block tracking-tight">
                          ₦{Number(job.institution_cost || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className="font-black text-sm text-green-600 block tracking-tight">
                          {job.status === 'Completed' 
                            ? `₦${Number(job.staff_commission || 0).toLocaleString()}` 
                            : 'Pending'}
                        </span>
                      </td>
                      <td className="py-4 text-sm font-black uppercase tracking-tight text-slate-500">
                        {job.completed_at 
                          ? new Date(job.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          : 'In Progress'}
                      </td>
                      <td className="py-4">
                        <span className={`inline-block px-4 py-1.5 border-2 border-blue-950 rounded-full text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_0px_rgba(26,54,93,1)] ${
                          job.status === 'Completed' 
                            ? 'bg-green-500 text-white' 
                            : 'bg-blue-500 text-white'
                        }`}>
                          {job.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}