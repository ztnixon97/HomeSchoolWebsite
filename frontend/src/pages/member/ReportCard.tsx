import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';

interface ClassAssignment {
  id: number;
  title: string;
  description: string | null;
  category: string | null;
  max_points: number;
  due_date: string | null;
}

interface StudentGrade {
  id: number;
  assignment_id: number;
  student_id: number;
  student_name: string | null;
  score: number | null;
  notes: string | null;
  status: string;
}

interface CategoryWeight {
  id: number;
  group_id: number;
  category: string;
  weight: number;
  drop_lowest: number;
}

interface RosterStudent {
  id: number;
  first_name: string;
  last_name: string;
}

interface ClassGroup {
  id: number;
  name: string;
}

export default function ReportCard() {
  const { id, studentId } = useParams<{ id: string; studentId: string }>();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [categoryWeights, setCategoryWeights] = useState<CategoryWeight[]>([]);
  const [student, setStudent] = useState<RosterStudent | null>(null);
  const [className, setClassName] = useState('');

  useEffect(() => {
    if (!id || !studentId) return;
    setLoading(true);
    Promise.all([
      api.get<{ assignments: ClassAssignment[]; grades: StudentGrade[]; category_weights: CategoryWeight[] }>(`/api/class-groups/${id}/grades`),
      api.get<RosterStudent[]>(`/api/class-groups/${id}/roster`),
      api.get<ClassGroup>(`/api/class-groups/${id}`),
    ]).then(([gradesData, roster, group]) => {
      setAssignments(gradesData.assignments);
      setGrades(gradesData.grades.filter(g => g.student_id === Number(studentId)));
      setCategoryWeights(gradesData.category_weights || []);
      setStudent(roster.find(s => s.id === Number(studentId)) || null);
      setClassName(group.name);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id, studentId]);

  const getLetterGrade = (pct: number) => {
    if (pct >= 93) return 'A';
    if (pct >= 90) return 'A-';
    if (pct >= 87) return 'B+';
    if (pct >= 83) return 'B';
    if (pct >= 80) return 'B-';
    if (pct >= 77) return 'C+';
    if (pct >= 73) return 'C';
    if (pct >= 70) return 'C-';
    if (pct >= 67) return 'D+';
    if (pct >= 63) return 'D';
    if (pct >= 60) return 'D-';
    return 'F';
  };

  const calcOverallAverage = () => {
    const gradedGrades = grades.filter(g => g.status === 'graded' && g.score != null);
    if (gradedGrades.length === 0) return null;

    let totalPct = 0, count = 0;
    for (const g of gradedGrades) {
      const a = assignments.find(a => a.id === g.assignment_id);
      if (a && a.max_points > 0) {
        totalPct += ((g.score || 0) / a.max_points) * 100;
        count++;
      }
    }
    return count > 0 ? totalPct / count : null;
  };

  const calcWeightedAverage = () => {
    if (categoryWeights.length === 0) return null;
    const gradedGrades = grades.filter(g => g.status === 'graded' && g.score != null);
    if (gradedGrades.length === 0) return null;

    const weightMap = Object.fromEntries(categoryWeights.map(w => [w.category, w]));
    const catGrades: Record<string, { score: number; max: number }[]> = {};
    for (const g of gradedGrades) {
      const a = assignments.find(a => a.id === g.assignment_id);
      if (!a || !a.category || !weightMap[a.category]) continue;
      if (!catGrades[a.category]) catGrades[a.category] = [];
      catGrades[a.category].push({ score: g.score || 0, max: a.max_points });
    }

    let weightedSum = 0, weightTotal = 0;
    for (const [cat, items] of Object.entries(catGrades)) {
      const cw = weightMap[cat];
      if (!cw) continue;
      let sorted = items.map(i => ({ ...i, pct: i.max > 0 ? i.score / i.max : 0 })).sort((a, b) => a.pct - b.pct);
      const dropCount = Math.min(cw.drop_lowest || 0, Math.max(sorted.length - 1, 0));
      sorted = sorted.slice(dropCount);
      const totalScore = sorted.reduce((s, i) => s + i.score, 0);
      const totalMax = sorted.reduce((s, i) => s + i.max, 0);
      if (totalMax > 0) {
        weightedSum += (totalScore / totalMax) * cw.weight;
        weightTotal += cw.weight;
      }
    }
    return weightTotal > 0 ? (weightedSum / weightTotal) * 100 : null;
  };

  const calcCategoryAverage = (category: string) => {
    const catAssignments = assignments.filter(a => a.category === category);
    const catGrades = grades.filter(g => g.status === 'graded' && g.score != null && catAssignments.some(a => a.id === g.assignment_id));
    if (catGrades.length === 0) return null;
    const totalScore = catGrades.reduce((s, g) => s + (g.score || 0), 0);
    const totalMax = catGrades.reduce((s, g) => {
      const a = catAssignments.find(a => a.id === g.assignment_id);
      return s + (a?.max_points || 0);
    }, 0);
    return totalMax > 0 ? (totalScore / totalMax) * 100 : null;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadCSV = () => {
    window.open(`/api/class-groups/${id}/report-card/${studentId}`, '_blank');
  };

  if (loading) return <div className="text-center py-16 text-ink/40">Loading report card...</div>;

  if (!student) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <p className="text-red-600">Student not found.</p>
        <Link to={`/classes/${id}`} className="text-emerald-700 text-sm mt-2 inline-block">Back to Class</Link>
      </div>
    );
  }

  const overallAvg = calcWeightedAverage() ?? calcOverallAverage();
  const categories = [...new Set(categoryWeights.map(w => w.category))];

  return (
    <>
      <style>{`
        @media print {
          header, footer, nav, .no-print { display: none !important; }
          main { padding: 0 !important; max-width: none !important; }
          body { background: white !important; }
          .print-page { box-shadow: none !important; border: none !important; }
        }
      `}</style>
      <div className="max-w-3xl mx-auto py-8">
        <div className="no-print flex items-center justify-between mb-6">
          <Link to={`/classes/${id}`} className="text-emerald-700 text-sm hover:underline">&larr; Back to Class</Link>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadCSV}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
            >
              Download CSV
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-emerald-700 text-white text-sm rounded-lg hover:bg-emerald-800 transition-colors"
            >
              Print
            </button>
          </div>
        </div>

        <div className="print-page bg-white rounded-xl border border-gray-100 shadow-sm p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-ink">Report Card</h1>
            <p className="text-gray-600 mt-1">{className}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 text-sm">
            <div>
              <span className="text-gray-500">Student:</span>
              <span className="ml-2 font-medium text-ink">{student.first_name} {student.last_name}</span>
            </div>
            <div>
              <span className="text-gray-500">Class:</span>
              <span className="ml-2 font-medium text-ink">{className}</span>
            </div>
            <div>
              <span className="text-gray-500">Date:</span>
              <span className="ml-2 font-medium text-ink">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
          </div>

          {overallAvg != null && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Overall Grade</span>
                <div className="text-right">
                  <span className="text-2xl font-bold text-ink">{getLetterGrade(overallAvg)}</span>
                  <span className="ml-2 text-lg text-gray-600">{overallAvg.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          )}

          {categories.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-ink mb-3">Category Averages</h2>
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Category</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Weight</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Average</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {categories.map(cat => {
                    const avg = calcCategoryAverage(cat);
                    const weight = categoryWeights.find(w => w.category === cat);
                    return (
                      <tr key={cat}>
                        <td className="px-4 py-2 text-ink">{cat}</td>
                        <td className="px-4 py-2 text-gray-500">{weight?.weight ?? 0}%</td>
                        <td className="px-4 py-2 text-ink">{avg != null ? `${avg.toFixed(1)}%` : '--'}</td>
                        <td className="px-4 py-2 text-ink">{avg != null ? getLetterGrade(avg) : '--'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-ink mb-3">Assignments</h2>
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Assignment</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Category</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Score</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Max</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">%</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {assignments.map(a => {
                  const grade = grades.find(g => g.assignment_id === a.id);
                  const pct = grade && grade.score != null && a.max_points > 0
                    ? ((grade.score / a.max_points) * 100)
                    : null;
                  return (
                    <tr key={a.id}>
                      <td className="px-4 py-2 text-ink">{a.title}</td>
                      <td className="px-4 py-2 text-gray-500">{a.category || '--'}</td>
                      <td className="px-4 py-2 text-ink">
                        {grade ? (grade.status === 'excused' ? '--' : grade.score ?? '--') : '--'}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{a.max_points}</td>
                      <td className="px-4 py-2 text-ink">{pct != null ? `${pct.toFixed(1)}%` : '--'}</td>
                      <td className="px-4 py-2">
                        {grade ? (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            grade.status === 'graded' ? 'bg-emerald-100 text-emerald-800' :
                            grade.status === 'excused' ? 'bg-yellow-100 text-yellow-800' :
                            grade.status === 'missing' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-600'
                          }`}>{grade.status}</span>
                        ) : (
                          <span className="text-xs text-gray-400">Not graded</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
