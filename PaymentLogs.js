import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function PaymentLogs({ userProfile }) {
  const [allocation, setAllocation] = useState(0);
  const [spendingHistory, setSpendingHistory] = useState([]);
  const [adminMasterLogs, setAdminMasterLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Read current user info (Fallbacks if context isn't fully loaded)
  const isInternalAdmin = userProfile?.role === 'admin' || userProfile?.role === 'manager' || userProfile?.role === 'account';
  const currentStaffId = userProfile?.id;

  useEffect(() => {
    if (userProfile) {
      fetchLogData();
    }
  }, [userProfile]);

  const fetchLogData = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    try {
      if (isInternalAdmin) {
        // ADMIN LOGIC: Get allocation vs spending data for ALL active staff members
        const { data: allocations } = await supabase
          .from('daily_allocations')
          .select('amount_given, profiles!daily_allocations_staff_id_fkey(id, name)')
          .eq('date', today);

        const { data: spending } = await supabase
          .from('institution_spending')
          .select('amount_spent, staff_id')
          .gte('created_at', `${today}T00:00:00Z`);

        // Group data by staff member to find total spent and calculate surplus
        const masterReport = allocations?.map(alloc => {
          const totalSpent = spending
            ?.filter(s => s.staff_id === alloc.profiles.id)
            .reduce((sum, item) => sum + Number(item.amount_spent), 0) || 0;

          return {
            staffName: alloc.profiles.name,
            allocated: Number(alloc.amount_given),
            spent: totalSpent,
            surplus: Number(alloc.amount_given) - totalSpent
          };
        }) || [];

        setAdminMasterLogs(masterReport);
      } else {
        // SERVICE STAFF LOGIC: Get individual daily budget status
        const { data: allocData } = await supabase
          .from('daily_allocations')
          .select('amount_given')
          .eq('staff_id', currentStaffId)
          .eq('date', today)
          .single();

        const { data: spendData } = await supabase
          .from('institution_spending')
          .select('amount_spent, service_name, student_name, created_at')
          .eq('staff_id', currentStaffId)
          .gte('created_at', `${today}T00:00:00Z`);

        if (allocData) setAllocation(Number(allocData.amount_given));
        if (spendData) setSpendingHistory(spendData);
      }
    } catch (error) {
      console.error('Error fetching financial logs:', error);
    } finally {
      setLoading(false);
    }
  };

  // Math totals for the logged-in Service Staff member
  const totalSpent = spendingHistory.reduce((sum, item) => sum + Number(item.amount_spent), 0);
  const surplusToReturn = allocation - totalSpent;
  const isLowBalance = surplusToReturn < 5000 && allocation > 0;

  if (loading) return <div className="p-8 text-center text-gray-500">Loading daily metrics...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto font-sans text-gray-800">
      <h1 className="text-2xl font-bold border-b pb-4 mb-6">Daily Financial Logs</h1>

      {/* --- ADMIN VIEW DASHBOARD --- */}
      {isInternalAdmin && (
        <div>
          <h2 className="text-lg font-semibold mb-4 text-gray-600">Staff Surplus & Settlement Overview</h2>
          <div className="bg-white shadow rounded-lg overflow-hidden border">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b font-medium text-gray-600">
                  <th className="p-4">Staff Member</th>
                  <th className="p-4">Morning Allocation</th>
                  <th className="p-4">Total Spent</th>
                  <th className="p-4">Surplus to Return</th>
                </tr>
              </thead>
              <tbody>
                {adminMasterLogs.length === 0 ? (
                  <tr><td colSpan="4" className="p-4 text-center text-gray-400">No daily allocations created yet.</td></tr>
                ) : (
                  adminMasterLogs.map((log, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="p-4 font-medium">{log.staffName}</td>
                      <td className="p-4">₦{log.allocated.toLocaleString()}</td>
                      <td className="p-4 text-red-600">₦{log.spent.toLocaleString()}</td>
                      <td className="p-4 text-green-600 font-bold">₦{log.surplus.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- SERVICE STAFF VIEW --- */}
      {!isInternalAdmin && (
        <div className="space-y-6">
          {/* Low Balance Warning Banner */}
          {isLowBalance && (
            <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r shadow-sm">
              <p className="font-semibold">⚠️ Account Balance Low</p>
              <p className="text-sm">Your remaining operational balance is below ₦5,000. Please coordinate with Administration for top-ups.</p>
            </div>
          )}

          {/* Individual Summary Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 border border-blue-200 p-5 rounded-lg shadow-sm">
              <span className="text-xs uppercase tracking-wider text-blue-600 font-bold">Allocated This Morning</span>
              <p className="text-3xl font-bold mt-1">₦{allocation.toLocaleString()}</p>
            </div>
            <div className="bg-red-50 border border-red-200 p-5 rounded-lg shadow-sm">
              <span className="text-xs uppercase tracking-wider text-red-600 font-bold">Total Disbursed Costs</span>
              <p className="text-3xl font-bold mt-1">₦{totalSpent.toLocaleString()}</p>
            </div>
            <div className="bg-green-50 border border-green-200 p-5 rounded-lg shadow-sm">
              <span className="text-xs uppercase tracking-wider text-green-600 font-bold">End-of-Day Return Surplus</span>
              <p className="text-3xl font-bold mt-1">₦{surplusToReturn.toLocaleString()}</p>
            </div>
          </div>

          {/* Itemized Spend History Breakdown */}
          <div>
            <h3 className="text-lg font-semibold mb-3 mt-4 text-gray-700">Detailed Expense Logs</h3>
            <div className="bg-white shadow border rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b font-medium text-gray-600">
                    <th className="p-4">Time</th>
                    <th className="p-4">Student Context</th>
                    <th className="p-4">Associated Service</th>
                    <th className="p-4">Institution Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {spendingHistory.length === 0 ? (
                    <tr><td colSpan="4" className="p-4 text-center text-gray-400">No transactions recorded for today.</td></tr>
                  ) : (
                    spendingHistory.map((item, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-4 text-gray-500 text-sm">
                          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-4 font-medium">{item.student_name}</td>
                        <td className="p-4"><span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full text-xs font-medium">{item.service_name}</span></td>
                        <td className="p-4 text-red-600 font-semibold">- ₦{Number(item.amount_spent).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}