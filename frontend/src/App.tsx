import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, SessionGuard } from './auth';
import Layout from './components/Layout';
import RoleGuard from './components/RoleGuard';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';

// Public pages
import Home from './pages/public/Home';
import Schedule from './pages/public/Schedule';
import Blog from './pages/public/Blog';
import About from './pages/public/About';
import Contact from './pages/public/Contact';

// Auth pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

// Member pages
import Dashboard from './pages/member/Dashboard';
import BlogPost from './pages/member/BlogPost';
import CreatePost from './pages/member/CreatePost';
import DraftPosts from './pages/member/DraftPosts';
import PostPreview from './pages/member/PostPreview';
import EditPost from './pages/member/EditPost';
import LessonPlans from './pages/member/LessonPlans';
import LessonPlanDetail from './pages/member/LessonPlanDetail';
import CreateLessonPlan from './pages/member/CreateLessonPlan';
import EditLessonPlan from './pages/member/EditLessonPlan';
import Resources from './pages/member/Resources';
import MyChildren from './pages/member/MyChildren';
import ClassSessions from './pages/member/ClassSessions';
import SessionDetail from './pages/member/SessionDetail';
import StudentProgress from './pages/member/StudentProgress';
import Members from './pages/member/Members';
import AccountSettings from './pages/member/AccountSettings';
import MyRsvps from './pages/member/MyRsvps';

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard';
import ManageUsers from './pages/admin/ManageUsers';
import ManageStudents from './pages/admin/ManageStudents';
import ManageResources from './pages/admin/ManageResources';
import ManageSessions from './pages/admin/ManageSessions';
import ManageSessionTypes from './pages/admin/ManageSessionTypes';
import BulkSessions from './pages/admin/BulkSessions';
import ManageSiteContent from './pages/admin/ManageSiteContent';
import EmailParents from './pages/admin/EmailParents';
import ManageAnnouncements from './pages/admin/ManageAnnouncements';
import ManageFiles from './pages/admin/ManageFiles';

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <ToastProvider>
          <AuthProvider>
            <SessionGuard />
            <Routes>
          <Route element={<Layout />}>
            {/* Public */}
            <Route path="/" element={<Home />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:id" element={<BlogPost />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />

            {/* Auth */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Member (any logged-in user) */}
            <Route path="/dashboard" element={<RoleGuard><Dashboard /></RoleGuard>} />
            <Route path="/lesson-plans" element={<RoleGuard><LessonPlans /></RoleGuard>} />
            <Route path="/lesson-plans/:id" element={<RoleGuard><LessonPlanDetail /></RoleGuard>} />
            <Route path="/lesson-plans/:id/edit" element={<RoleGuard><EditLessonPlan /></RoleGuard>} />
            <Route path="/sessions" element={<RoleGuard><ClassSessions /></RoleGuard>} />
            <Route path="/sessions/:id" element={<RoleGuard><SessionDetail /></RoleGuard>} />
            <Route path="/members" element={<RoleGuard><Members /></RoleGuard>} />
            <Route path="/my-children" element={<RoleGuard><MyChildren /></RoleGuard>} />
            <Route path="/my-rsvps" element={<RoleGuard><MyRsvps /></RoleGuard>} />
            <Route path="/account" element={<RoleGuard><AccountSettings /></RoleGuard>} />

            {/* Teacher+ */}
            <Route path="/posts/new" element={<RoleGuard requireRole="teacher"><CreatePost /></RoleGuard>} />
            <Route path="/posts/drafts" element={<RoleGuard requireRole="teacher"><DraftPosts /></RoleGuard>} />
            <Route path="/posts/:id/preview" element={<RoleGuard requireRole="teacher"><PostPreview /></RoleGuard>} />
            <Route path="/posts/:id/edit" element={<RoleGuard requireRole="teacher"><EditPost /></RoleGuard>} />
            <Route path="/lesson-plans/new" element={<RoleGuard requireRole="teacher"><CreateLessonPlan /></RoleGuard>} />
            <Route path="/student-progress" element={<RoleGuard requireRole="teacher"><StudentProgress /></RoleGuard>} />
            <Route path="/student-progress/:id" element={<RoleGuard requireRole="teacher"><StudentProgress /></RoleGuard>} />

            {/* Admin */}
            <Route path="/admin" element={<RoleGuard requireRole="admin"><AdminDashboard /></RoleGuard>} />
            <Route path="/admin/users" element={<RoleGuard requireRole="admin"><ManageUsers /></RoleGuard>} />
            <Route path="/admin/students" element={<RoleGuard requireRole="admin"><ManageStudents /></RoleGuard>} />
            <Route path="/admin/resources" element={<RoleGuard requireRole="admin"><ManageResources /></RoleGuard>} />
            <Route path="/admin/sessions" element={<RoleGuard requireRole="admin"><ManageSessions /></RoleGuard>} />
            <Route path="/admin/session-types" element={<RoleGuard requireRole="admin"><ManageSessionTypes /></RoleGuard>} />
            <Route path="/admin/bulk-sessions" element={<RoleGuard requireRole="admin"><BulkSessions /></RoleGuard>} />
            <Route path="/admin/site-content" element={<RoleGuard requireRole="admin"><ManageSiteContent /></RoleGuard>} />
            <Route path="/admin/email-parents" element={<RoleGuard requireRole="admin"><EmailParents /></RoleGuard>} />
            <Route path="/admin/announcements" element={<RoleGuard requireRole="admin"><ManageAnnouncements /></RoleGuard>} />
            <Route path="/admin/files" element={<RoleGuard requireRole="admin"><ManageFiles /></RoleGuard>} />
          </Route>
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
