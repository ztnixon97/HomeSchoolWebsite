use serde::{Deserialize, Serialize};

// ── Users ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct User {
    pub id: i64,
    pub email: String,
    pub display_name: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub role: String,
    pub active: bool,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub preferred_contact: Option<String>,
    pub family_id: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub invite_code: String,
    pub email: String,
    pub password: String,
    pub display_name: String,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: i64,
    pub email: String,
    pub display_name: String,
    pub role: String,
    pub active: bool,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub preferred_contact: Option<String>,
    pub family_id: Option<i64>,
    pub created_at: String,
}

impl From<User> for UserResponse {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            email: u.email,
            display_name: u.display_name,
            role: u.role,
            active: u.active,
            phone: u.phone,
            address: u.address,
            preferred_contact: u.preferred_contact,
            family_id: u.family_id,
            created_at: u.created_at,
        }
    }
}

// ── Invites ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Invite {
    pub id: i64,
    pub code: String,
    pub role: String,
    pub email: Option<String>,
    pub used_by: Option<i64>,
    pub created_at: String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateInviteRequest {
    pub role: String,
    pub email: Option<String>,
    pub expires_at: Option<String>,
}

// ── Students ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Student {
    pub id: i64,
    pub first_name: String,
    pub last_name: String,
    pub date_of_birth: Option<String>,
    pub notes: Option<String>,
    pub allergies: String,
    pub dietary_restrictions: String,
    pub emergency_contact_name: Option<String>,
    pub emergency_contact_phone: Option<String>,
    pub enrolled: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateStudentRequest {
    pub first_name: String,
    pub last_name: String,
    pub date_of_birth: Option<String>,
    pub notes: Option<String>,
    pub allergies: Option<String>,
    pub dietary_restrictions: Option<String>,
    pub emergency_contact_name: Option<String>,
    pub emergency_contact_phone: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateStudentRequest {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub date_of_birth: Option<String>,
    pub notes: Option<String>,
    pub allergies: Option<String>,
    pub dietary_restrictions: Option<String>,
    pub emergency_contact_name: Option<String>,
    pub emergency_contact_phone: Option<String>,
    pub enrolled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMyChildRequest {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub date_of_birth: Option<String>,
    pub notes: Option<String>,
    pub allergies: Option<String>,
    pub dietary_restrictions: Option<String>,
    pub emergency_contact_name: Option<String>,
    pub emergency_contact_phone: Option<String>,
}

// ── Events ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Event {
    pub id: i64,
    pub title: String,
    pub description: Option<String>,
    pub event_date: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub event_type: String,
    pub created_by: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateEventRequest {
    pub title: String,
    pub description: Option<String>,
    pub event_date: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub event_type: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEventRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub event_date: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub event_type: Option<String>,
}

// ── Posts (Blog) ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Post {
    pub id: i64,
    pub author_id: i64,
    pub author_name: Option<String>,
    pub title: String,
    pub content: String,
    pub category: Option<String>,
    pub published: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePostRequest {
    pub title: String,
    pub content: String,
    pub category: Option<String>,
    pub published: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePostRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub category: Option<String>,
    pub published: Option<bool>,
}

// ── Lesson Plans ──

#[derive(Debug, Serialize, Deserialize)]
pub struct LessonPlan {
    pub id: i64,
    pub author_id: i64,
    pub author_name: Option<String>,
    pub title: String,
    pub description: String,
    pub age_group: Option<String>,
    pub category: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BasicUser {
    pub id: i64,
    pub display_name: String,
    pub email: String,
    pub role: String,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub preferred_contact: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemberProfile {
    pub id: i64,
    pub display_name: String,
    pub email: String,
    pub role: String,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub preferred_contact: Option<String>,
    pub hosted_sessions: Vec<String>,
    pub upcoming_sessions: Vec<String>,
    pub children: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LessonPlanCollaborator {
    pub user_id: i64,
    pub display_name: String,
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct AddCollaboratorRequest {
    pub user_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateLessonPlanRequest {
    pub title: String,
    pub description: String,
    pub age_group: Option<String>,
    pub category: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateLessonPlanRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub age_group: Option<String>,
    pub category: Option<String>,
}

// ── Files ──

#[derive(Debug, Serialize, Deserialize)]
pub struct FileRecord {
    pub id: i64,
    pub uploader_id: i64,
    pub filename: String,
    pub storage_path: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub linked_type: Option<String>,
    pub linked_id: Option<i64>,
    pub created_at: String,
}

// ── Milestones ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Milestone {
    pub id: i64,
    pub student_id: i64,
    pub recorded_by: i64,
    pub category: String,
    pub title: String,
    pub notes: Option<String>,
    pub achieved_date: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateMilestoneRequest {
    pub student_id: i64,
    pub category: String,
    pub title: String,
    pub notes: Option<String>,
    pub achieved_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMilestoneRequest {
    pub category: Option<String>,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub achieved_date: Option<String>,
}

// ── Attendance (legacy — use SessionAttendance for class_sessions) ──

#[derive(Debug, Deserialize)]
pub struct RecordAttendanceRequest {
    pub student_id: i64,
    pub event_id: i64,
    pub present: bool,
    pub note: Option<String>,
}

// ── Resources ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Resource {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub category: String,
    pub sort_order: i32,
    pub published: bool,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateResourceRequest {
    pub title: String,
    pub content: String,
    pub category: String,
    pub sort_order: Option<i32>,
    pub published: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateResourceRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub category: Option<String>,
    pub sort_order: Option<i32>,
    pub published: Option<bool>,
}

// ── Student-Parent linking ──

#[derive(Debug, Deserialize)]
pub struct LinkParentRequest {
    pub student_id: i64,
    pub user_id: i64,
}

// ── Class Sessions ──

#[derive(Debug, Serialize, Deserialize)]
pub struct ClassSession {
    pub id: i64,
    pub title: String,
    pub theme: Option<String>,
    pub session_date: String,
    pub end_date: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub host_id: Option<i64>,
    pub host_name: Option<String>,
    pub host_address: Option<String>,
    pub location_name: Option<String>,
    pub location_address: Option<String>,
    pub cost_amount: Option<f64>,
    pub cost_details: Option<String>,
    pub lesson_plan_id: Option<i64>,
    pub materials_needed: Option<String>,
    pub max_students: Option<i64>,
    pub notes: Option<String>,
    pub status: String,
    pub session_type_id: Option<i64>,
    pub session_type_name: Option<String>,
    pub session_type_label: Option<String>,
    pub rsvp_cutoff: Option<String>,
    pub require_approval: bool,
    pub created_by: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub title: String,
    pub theme: Option<String>,
    pub session_date: String,
    pub end_date: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub location_name: Option<String>,
    pub location_address: Option<String>,
    pub cost_amount: Option<f64>,
    pub cost_details: Option<String>,
    pub max_students: Option<i64>,
    pub notes: Option<String>,
    pub session_type_id: Option<i64>,
    pub rsvp_cutoff: Option<String>,
    pub require_approval: Option<bool>,
    pub class_group_ids: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSessionRequest {
    pub title: Option<String>,
    pub theme: Option<String>,
    pub session_date: Option<String>,
    pub end_date: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub location_name: Option<String>,
    pub location_address: Option<String>,
    pub cost_amount: Option<f64>,
    pub cost_details: Option<String>,
    pub max_students: Option<i64>,
    pub notes: Option<String>,
    pub status: Option<String>,
    pub session_type_id: Option<i64>,
    pub rsvp_cutoff: Option<String>,
    pub require_approval: Option<bool>,
    pub class_group_ids: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize)]
pub struct ClaimSessionRequest {
    pub host_address: String,
    pub lesson_plan_id: Option<i64>,
    pub materials_needed: Option<String>,
    pub rsvp_cutoff: Option<String>,
    pub require_approval: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateHostSessionRequest {
    pub title: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub host_address: Option<String>,
    pub lesson_plan_id: Option<i64>,
    pub materials_needed: Option<String>,
    pub max_students: Option<i64>,
    pub notes: Option<String>,
    pub rsvp_cutoff: Option<String>,
    pub require_approval: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionType {
    pub id: i64,
    pub name: String,
    pub label: String,
    pub sort_order: i32,
    pub active: bool,
    pub hostable: bool,
    pub rsvpable: bool,
    pub multi_day: bool,
    pub description: Option<String>,
    pub requires_location: bool,
    pub supports_cost: bool,
    pub cost_label: Option<String>,
    pub allow_supplies: bool,
    pub allow_attendance: bool,
    pub allow_photos: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionTypeRequest {
    pub name: String,
    pub label: String,
    pub sort_order: Option<i32>,
    pub active: Option<bool>,
    pub hostable: Option<bool>,
    pub rsvpable: Option<bool>,
    pub multi_day: Option<bool>,
    pub description: Option<String>,
    pub requires_location: Option<bool>,
    pub supports_cost: Option<bool>,
    pub cost_label: Option<String>,
    pub allow_supplies: Option<bool>,
    pub allow_attendance: Option<bool>,
    pub allow_photos: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSessionTypeRequest {
    pub name: Option<String>,
    pub label: Option<String>,
    pub sort_order: Option<i32>,
    pub active: Option<bool>,
    pub hostable: Option<bool>,
    pub rsvpable: Option<bool>,
    pub multi_day: Option<bool>,
    pub description: Option<String>,
    pub requires_location: Option<bool>,
    pub supports_cost: Option<bool>,
    pub cost_label: Option<String>,
    pub allow_supplies: Option<bool>,
    pub allow_attendance: Option<bool>,
    pub allow_photos: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PostComment {
    pub id: i64,
    pub post_id: i64,
    pub author_id: i64,
    pub author_name: Option<String>,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCommentRequest {
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCommentRequest {
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct PostSearchQuery {
    pub q: Option<String>,
    pub category: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct PostSearchResponse {
    pub items: Vec<Post>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

#[derive(Debug, Serialize)]
pub struct PostNeighbor {
    pub id: i64,
    pub title: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct PostNeighborsResponse {
    pub prev: Option<PostNeighbor>,
    pub next: Option<PostNeighbor>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionDefaults {
    pub default_start_time: String,
    pub default_capacity: i64,
    pub default_rsvp_cutoff_days: i64,
}

// ── RSVPs ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Rsvp {
    pub id: i64,
    pub session_id: i64,
    pub student_id: i64,
    pub student_name: Option<String>,
    pub parent_id: i64,
    pub parent_name: Option<String>,
    pub status: String,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateRsvpRequest {
    pub session_id: i64,
    pub student_id: i64,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRsvpRequest {
    pub status: Option<String>,
    pub note: Option<String>,
}

// ── Site Pages ──

#[derive(Debug, Serialize, Deserialize)]
pub struct SitePage {
    pub slug: String,
    pub title: String,
    pub content: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSitePageRequest {
    pub title: Option<String>,
    pub content: Option<String>,
}

// ── Password Reset ──

#[derive(Debug, Deserialize)]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub token: String,
    pub new_password: String,
}

// ── Email Parents ──

#[derive(Debug, Deserialize)]
pub struct EmailParentsRequest {
    pub subject: String,
    pub body: String,
}

// ── Admin Password Reset ──

#[derive(Debug, Deserialize)]
pub struct AdminResetPasswordRequest {
    pub new_password: String,
}

// EmailParentsResponse removed — unused

// ── Account Management ──

#[derive(Debug, Deserialize)]
pub struct UpdateEmailRequest {
    pub new_email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub preferred_contact: Option<String>,
}

// ── Announcements ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Announcement {
    pub id: i64,
    pub title: String,
    pub body: String,
    pub announcement_type: String,
    pub active: bool,
    pub created_by: Option<i64>,
    pub created_by_name: Option<String>,
    pub expires_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAnnouncementRequest {
    pub title: String,
    pub body: String,
    pub announcement_type: Option<String>,
    pub expires_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAnnouncementRequest {
    pub title: Option<String>,
    pub body: Option<String>,
    pub announcement_type: Option<String>,
    pub active: Option<bool>,
    pub expires_at: Option<String>,
}

// ── Families ──

#[derive(Debug, Serialize, Deserialize)]
pub struct FamilyMember {
    pub id: i64,
    pub display_name: String,
    pub email: String,
    pub role: String,
}

#[derive(Debug, Serialize)]
pub struct FamilyDetail {
    pub id: i64,
    pub name: String,
    pub members: Vec<FamilyMember>,
    pub children: Vec<Student>,
}

#[derive(Debug, Serialize)]
pub struct FamilyInviteInfo {
    pub id: i64,
    pub family_id: i64,
    pub family_name: String,
    pub invited_by_name: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateFamilyRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateFamilyRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct InviteFamilyMemberRequest {
    pub email: String,
}

// ── Pagination ──

// PaginatedResponse removed — using serde_json::json! directly

#[derive(Debug, Deserialize)]
pub struct SessionsQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub q: Option<String>,
    pub status: Option<String>,
    pub session_type_id: Option<i64>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub class_group_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct LessonPlansQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub q: Option<String>,
    pub category: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MembersQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub q: Option<String>,
    pub role: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AdminUsersQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub q: Option<String>,
    pub role: Option<String>,
    pub active: Option<bool>,
}

// RsvpsQuery removed — unused

// ── Session Attendance ──

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionAttendance {
    pub id: i64,
    pub session_id: i64,
    pub student_id: i64,
    pub student_name: Option<String>,
    pub present: bool,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RecordSessionAttendanceRequest {
    pub session_id: i64,
    pub records: Vec<AttendanceRecord>,
}

#[derive(Debug, Deserialize)]
pub struct AttendanceRecord {
    pub student_id: i64,
    pub present: bool,
    pub note: Option<String>,
}

// ── Session Supplies ──

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionSupply {
    pub id: i64,
    pub session_id: i64,
    pub item_name: String,
    pub quantity: Option<String>,
    pub claimed_by: Option<i64>,
    pub claimed_by_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSupplyRequest {
    pub item_name: String,
    pub quantity: Option<String>,
}

// UpdateSupplyRequest removed — unused

// ── Class Groups ──

#[derive(Debug, Serialize, Deserialize)]
pub struct ClassGroup {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub sort_order: i32,
    pub active: bool,
    pub grading_enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateClassGroupRequest {
    pub name: String,
    pub description: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateClassGroupRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub sort_order: Option<i32>,
    pub active: Option<bool>,
    pub grading_enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct AddGroupMemberRequest {
    pub group_id: i64,
    pub student_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct AddGroupTeacherRequest {
    pub group_id: i64,
    pub user_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateClassHomeContentRequest {
    pub home_content: Option<String>,
}

// ── Class Group Announcements ──

#[derive(Debug, Serialize, Deserialize)]
pub struct ClassGroupAnnouncement {
    pub id: i64,
    pub group_id: i64,
    pub title: String,
    pub body: String,
    pub created_by: Option<i64>,
    pub created_by_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateClassGroupAnnouncementRequest {
    pub group_id: i64,
    pub title: String,
    pub body: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateClassGroupAnnouncementRequest {
    pub title: Option<String>,
    pub body: Option<String>,
}

// ── Class Assignments & Grades ──

#[derive(Debug, Serialize, Deserialize)]
pub struct ClassAssignment {
    pub id: i64,
    pub group_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub max_points: f64,
    pub due_date: Option<String>,
    pub created_by: i64,
    pub created_by_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAssignmentRequest {
    pub group_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub max_points: Option<f64>,
    pub due_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAssignmentRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub max_points: Option<f64>,
    pub due_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StudentGrade {
    pub id: i64,
    pub assignment_id: i64,
    pub student_id: i64,
    pub student_name: Option<String>,
    pub score: Option<f64>,
    pub notes: Option<String>,
    pub graded_by: i64,
    pub graded_by_name: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveGradeRequest {
    pub student_id: i64,
    pub score: Option<f64>,
    pub notes: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BulkSaveGradesRequest {
    pub grades: Vec<SaveGradeRequest>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CategoryWeight {
    pub id: i64,
    pub group_id: i64,
    pub category: String,
    pub weight: f64,
}

#[derive(Debug, Deserialize)]
pub struct SaveCategoryWeightsRequest {
    pub weights: Vec<CategoryWeightEntry>,
}

#[derive(Debug, Deserialize)]
pub struct CategoryWeightEntry {
    pub category: String,
    pub weight: f64,
    pub drop_lowest: Option<i64>,
}

// ── Conversations / Messages ──

#[derive(Debug, Deserialize)]
pub struct CreateConversationRequest {
    pub participant_ids: Vec<i64>,
    pub subject: Option<String>,
    pub body: String,
}

// ── Documents ──

#[derive(Debug, Deserialize)]
pub struct SubmitDocumentRequest {
    pub file_id: Option<i64>,
    pub student_id: Option<i64>,
    pub signature_file_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDocumentTemplateRequest {
    pub title: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub required: Option<bool>,
    pub file_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDocumentTemplateRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub required: Option<bool>,
    pub active: Option<bool>,
    pub file_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct ReviewSubmissionRequest {
    pub status: String,
    pub notes: Option<String>,
}

// ── Standards ──

#[derive(Debug, Deserialize)]
pub struct CreateStandardRequest {
    pub code: String,
    pub title: String,
    pub description: Option<String>,
    pub subject: Option<String>,
    pub grade_level: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateStandardRequest {
    pub code: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub subject: Option<String>,
    pub grade_level: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct LinkStandardsRequest {
    pub standard_ids: Vec<i64>,
}

// ── Payments ──

#[derive(Debug, Deserialize)]
pub struct CreatePaymentRequest {
    pub user_id: i64,
    pub session_id: Option<i64>,
    pub description: String,
    pub amount: f64,
    pub payment_type: Option<String>,
    pub status: Option<String>,
    pub notes: Option<String>,
    pub payment_method: Option<String>,
    pub due_date: Option<String>,
    pub category: Option<String>,
    pub reference_number: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePaymentRequest {
    pub description: Option<String>,
    pub amount: Option<f64>,
    pub payment_type: Option<String>,
    pub status: Option<String>,
    pub paid_at: Option<String>,
    pub notes: Option<String>,
    pub payment_method: Option<String>,
    pub due_date: Option<String>,
    pub category: Option<String>,
    pub reference_number: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BulkChargeRequest {
    pub session_id: i64,
    pub description: String,
    pub amount: f64,
    pub category: Option<String>,
    pub due_date: Option<String>,
    pub notes: Option<String>,
}
