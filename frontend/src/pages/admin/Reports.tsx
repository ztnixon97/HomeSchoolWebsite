import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useToast } from '../../components/Toast';

interface AttendanceSummary {
  session_id: number;
  session_title: string;
  session_date: string;
  total_students: number;
  present_count: number;
  absent_count: number;
  attendance_rate: number;
}

interface GradeDistribution {
  group_id: number;
  group_name: string;
  assignment_count: number;
  student_count: number;
  average_score: number;
  grade_breakdown: { letter: string; count: number }[];
}

export default function Reports() {
  const { showToast } = useToast();
  const [attendance, setAttendance] = useState<AttendanceSummary[]>([]);
  const [gradeData, setGradeData] = useState<GradeDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'attendance' | 'grades'>('attendance');

  useEffect(() => {
    Promise.all([
      api.get<AttendanceSummary[]>('/api/admin/reports/attendance').catch(() => [] as AttendanceSummary[]),
      api.get<GradeDistribution[]>('/api/admin/reports/grades').catch(() => [] as GradeDistribution[]),
    ]).then(([att, gr]) => {
      setAttendance(att);
      setGradeData(gr);
    }).catch(() => showToast('Failed to load reports', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const overallAttendanceRate = attendance.length > 0
    ? attendance.reduce((sum, a) => sum + a.attendance_rate, 0) / attendance.length
    : 0;

  if (loading) return <div className="text-center py-16 text-ink/40">Loading reports...</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <Link to="/admin" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium mb-4 inline-block">&larr; Admin Dashboard</Link>

      <div>
        <h1 className="text-2xl font-bold text-ink">Reports</h1>
        <p className="text-ink/60 text-sm mt-1">Analytics dashboard for attendance and grades</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'attendance' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Attendance
        </button>
        <button
          onClick={() => setActiveTab('grades')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'grades' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Grades
        </button>
      </div>

      {activeTab === 'attendance' && (
        <div className="space-y-4">
          {/* Overall rate */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Overall Attendance Rate</span>
              <span className={`text-2xl font-bold ${overallAttendanceRate >= 80 ? 'text-emerald-700' : overallAttendanceRate >= 60 ? 'text-amber-700' : 'text-red-700'}`}>
                {overallAttendanceRate.toFixed(1)}%
              </span>
            </div>
            <div className="mt-3 h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${overallAttendanceRate >= 80 ? 'bg-emerald-500' : overallAttendanceRate >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(overallAttendanceRate, 100)}%` }}
              />
            </div>
          </div>

          {attendance.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
              <p className="text-ink/40 text-sm">No attendance data available.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Session</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Present</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Absent</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {attendance.map(a => (
                    <tr key={a.session_id}>
                      <td className="px-4 py-3 text-ink">{a.session_title}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(a.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-center text-emerald-600 font-medium">{a.present_count}</td>
                      <td className="px-4 py-3 text-center text-red-500 font-medium">{a.absent_count}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden max-w-[100px]">
                            <div
                              className={`h-full rounded-full ${a.attendance_rate >= 80 ? 'bg-emerald-500' : a.attendance_rate >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(a.attendance_rate, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-600 font-medium">{a.attendance_rate.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'grades' && (
        <div className="space-y-4">
          {gradeData.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
              <p className="text-ink/40 text-sm">No grade data available.</p>
            </div>
          ) : (
            gradeData.map(g => (
              <div key={g.group_id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-ink">{g.group_name}</h3>
                    <p className="text-xs text-gray-500">{g.assignment_count} assignments, {g.student_count} students</p>
                  </div>
                  <span className="text-lg font-bold text-ink">{g.average_score.toFixed(1)}% avg</span>
                </div>

                {g.grade_breakdown.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-gray-500 mb-2">Grade Distribution</p>
                    {g.grade_breakdown.map(b => {
                      const maxCount = Math.max(...g.grade_breakdown.map(x => x.count), 1);
                      const pct = (b.count / maxCount) * 100;
                      return (
                        <div key={b.letter} className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-600 w-6">{b.letter}</span>
                          <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-8 text-right">{b.count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
