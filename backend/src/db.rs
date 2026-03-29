use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;
use std::path::Path;

pub type DbPool = Pool<SqliteConnectionManager>;

/// Customizer that sets per-connection PRAGMAs on every connection from the pool.
/// Without this, only the first connection gets the right settings.
#[derive(Debug)]
struct ConnectionInit;

impl r2d2::CustomizeConnection<rusqlite::Connection, rusqlite::Error> for ConnectionInit {
    fn on_acquire(&self, conn: &mut rusqlite::Connection) -> Result<(), rusqlite::Error> {
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;
        Ok(())
    }
}

pub fn init_pool(db_path: &str) -> DbPool {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(db_path).parent() {
        std::fs::create_dir_all(parent).expect("Failed to create database directory");
    }

    let manager = SqliteConnectionManager::file(db_path);
    let pool = Pool::builder()
        .max_size(5)
        .connection_customizer(Box::new(ConnectionInit))
        .build(manager)
        .expect("Failed to create database pool");

    // Enable WAL mode (database-level, persists across connections)
    {
        let conn = pool.get().expect("Failed to get connection");
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .expect("Failed to set WAL mode");
    }

    run_migrations(&pool);
    seed_admin(&pool);
    seed_site_pages(&pool);

    pool
}

fn run_migrations(pool: &DbPool) {
    let conn = pool.get().expect("Failed to get connection for migrations");

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'parent',
            active INTEGER NOT NULL DEFAULT 1,
            phone TEXT,
            address TEXT,
            preferred_contact TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL DEFAULT 'parent',
            email TEXT,
            used_by INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT
        );

        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            date_of_birth TEXT,
            notes TEXT,
            allergies TEXT NOT NULL DEFAULT '',
            dietary_restrictions TEXT NOT NULL DEFAULT '',
            enrolled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS student_parents (
            student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY (student_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            event_date TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            event_type TEXT NOT NULL DEFAULT 'class',
            created_by INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS session_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            hostable INTEGER NOT NULL DEFAULT 1,
            rsvpable INTEGER NOT NULL DEFAULT 1,
            multi_day INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id INTEGER NOT NULL REFERENCES users(id),
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            published INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS lesson_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id INTEGER NOT NULL REFERENCES users(id),
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            age_group TEXT,
            category TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS lesson_plan_collaborators (
            lesson_plan_id INTEGER NOT NULL REFERENCES lesson_plans(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY (lesson_plan_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uploader_id INTEGER NOT NULL REFERENCES users(id),
            filename TEXT NOT NULL,
            storage_path TEXT NOT NULL,
            mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
            size_bytes INTEGER NOT NULL DEFAULT 0,
            linked_type TEXT,
            linked_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            recorded_by INTEGER NOT NULL REFERENCES users(id),
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            notes TEXT,
            achieved_date TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            present INTEGER NOT NULL DEFAULT 0,
            note TEXT
        );

        CREATE TABLE IF NOT EXISTS resources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'general',
            sort_order INTEGER NOT NULL DEFAULT 0,
            published INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS class_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            theme TEXT,
            session_date TEXT NOT NULL,
            end_date TEXT,
            start_time TEXT,
            end_time TEXT,
            host_id INTEGER REFERENCES users(id),
            host_address TEXT,
            lesson_plan_id INTEGER REFERENCES lesson_plans(id),
            materials_needed TEXT,
            max_students INTEGER,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'open',
            session_type_id INTEGER REFERENCES session_types(id),
            rsvp_cutoff TEXT,
            require_approval INTEGER NOT NULL DEFAULT 0,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS rsvps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
            student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            parent_id INTEGER NOT NULL REFERENCES users(id),
            status TEXT NOT NULL DEFAULT 'confirmed',
            note TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(session_id, student_id)
        );
        CREATE TABLE IF NOT EXISTS post_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
            author_id INTEGER NOT NULL REFERENCES users(id),
            content TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS site_pages (
            slug TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            announcement_type TEXT NOT NULL DEFAULT 'info',
            active INTEGER NOT NULL DEFAULT 1,
            created_by INTEGER REFERENCES users(id),
            expires_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS families (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS family_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
            invited_by INTEGER NOT NULL REFERENCES users(id),
            invited_user_id INTEGER NOT NULL REFERENCES users(id),
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(family_id, invited_user_id)
        );

        CREATE TABLE IF NOT EXISTS session_supplies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
            item_name TEXT NOT NULL,
            quantity TEXT,
            claimed_by INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS session_attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
            student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            present INTEGER NOT NULL DEFAULT 0,
            note TEXT,
            recorded_by INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(session_id, student_id)
        );

        CREATE TABLE IF NOT EXISTS class_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS class_group_teachers (
            group_id INTEGER NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY (group_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS class_group_members (
            group_id INTEGER NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
            student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            PRIMARY KEY (group_id, student_id)
        );

        CREATE TABLE IF NOT EXISTS class_session_groups (
            session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
            group_id INTEGER NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
            PRIMARY KEY (session_id, group_id)
        );

        CREATE TABLE IF NOT EXISTS class_group_announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            created_by INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS class_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT,
            max_points REAL NOT NULL DEFAULT 100,
            due_date TEXT,
            created_by INTEGER NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS class_grades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assignment_id INTEGER NOT NULL REFERENCES class_assignments(id) ON DELETE CASCADE,
            student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            score REAL,
            notes TEXT,
            graded_by INTEGER NOT NULL REFERENCES users(id),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(assignment_id, student_id)
        );

        CREATE TABLE IF NOT EXISTS grade_category_weights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
            category TEXT NOT NULL,
            weight REAL NOT NULL,
            UNIQUE(group_id, category)
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            notification_type TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT,
            link TEXT,
            read INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject TEXT,
            created_by INTEGER NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS conversation_participants (
            conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            last_read_at TEXT,
            PRIMARY KEY (conversation_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            sender_id INTEGER NOT NULL REFERENCES users(id),
            body TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS document_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL DEFAULT 'waiver',
            required INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            file_id INTEGER REFERENCES files(id),
            created_by INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS document_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id),
            student_id INTEGER REFERENCES students(id),
            file_id INTEGER REFERENCES files(id),
            status TEXT NOT NULL DEFAULT 'submitted',
            reviewed_by INTEGER REFERENCES users(id),
            reviewed_at TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(template_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS standards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            subject TEXT,
            grade_level TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS assignment_standards (
            assignment_id INTEGER NOT NULL REFERENCES class_assignments(id) ON DELETE CASCADE,
            standard_id INTEGER NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
            PRIMARY KEY (assignment_id, standard_id)
        );

        CREATE TABLE IF NOT EXISTS payment_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            session_id INTEGER REFERENCES class_sessions(id),
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            payment_type TEXT NOT NULL DEFAULT 'charge',
            status TEXT NOT NULL DEFAULT 'pending',
            paid_at TEXT,
            recorded_by INTEGER REFERENCES users(id),
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS session_required_documents (
            session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
            template_id INTEGER NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
            PRIMARY KEY (session_id, template_id)
        );

        CREATE TABLE IF NOT EXISTS sessions_store (
            id TEXT PRIMARY KEY,
            data BLOB NOT NULL,
            expiry_date TEXT NOT NULL
        );
        ",
    )
    .expect("Failed to run migrations");

    // Incremental migrations for columns added after initial schema
    let _ = conn.execute("ALTER TABLE students ADD COLUMN allergies TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE students ADD COLUMN dietary_restrictions TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE class_sessions ADD COLUMN session_type_id INTEGER REFERENCES session_types(id)", []);
    let _ = conn.execute("ALTER TABLE class_sessions ADD COLUMN rsvp_cutoff TEXT", []);
    let _ = conn.execute("ALTER TABLE class_sessions ADD COLUMN end_date TEXT", []);
    let _ = conn.execute("ALTER TABLE class_sessions ADD COLUMN require_approval INTEGER NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE class_sessions ADD COLUMN location_name TEXT", []);
    let _ = conn.execute("ALTER TABLE class_sessions ADD COLUMN location_address TEXT", []);
    let _ = conn.execute("ALTER TABLE class_sessions ADD COLUMN cost_amount REAL", []);
    let _ = conn.execute("ALTER TABLE class_sessions ADD COLUMN cost_details TEXT", []);
    let _ = conn.execute("ALTER TABLE session_types ADD COLUMN hostable INTEGER NOT NULL DEFAULT 1", []);
    let _ = conn.execute("ALTER TABLE session_types ADD COLUMN rsvpable INTEGER NOT NULL DEFAULT 1", []);
    let _ = conn.execute("ALTER TABLE session_types ADD COLUMN multi_day INTEGER NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE session_types ADD COLUMN description TEXT", []);
    let _ = conn.execute("ALTER TABLE session_types ADD COLUMN allow_supplies INTEGER NOT NULL DEFAULT 1", []);
    let _ = conn.execute("ALTER TABLE session_types ADD COLUMN allow_attendance INTEGER NOT NULL DEFAULT 1", []);
    let _ = conn.execute("ALTER TABLE session_types ADD COLUMN allow_photos INTEGER NOT NULL DEFAULT 1", []);
    let _ = conn.execute("ALTER TABLE session_types ADD COLUMN requires_location INTEGER NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE session_types ADD COLUMN supports_cost INTEGER NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE session_types ADD COLUMN cost_label TEXT", []);
    let _ = conn.execute("ALTER TABLE users ADD COLUMN phone TEXT", []);
    let _ = conn.execute("ALTER TABLE users ADD COLUMN address TEXT", []);
    let _ = conn.execute("ALTER TABLE users ADD COLUMN preferred_contact TEXT", []);
    let _ = conn.execute("ALTER TABLE posts ADD COLUMN category TEXT", []);
    let _ = conn.execute("ALTER TABLE class_sessions ADD COLUMN reminder_sent INTEGER NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE users ADD COLUMN family_id INTEGER REFERENCES families(id)", []);
    let _ = conn.execute("ALTER TABLE users ADD COLUMN calendar_token TEXT", []);
    let _ = conn.execute("ALTER TABLE students ADD COLUMN emergency_contact_name TEXT", []);
    let _ = conn.execute("ALTER TABLE students ADD COLUMN emergency_contact_phone TEXT", []);
    let _ = conn.execute("ALTER TABLE class_groups ADD COLUMN grading_enabled INTEGER NOT NULL DEFAULT 0", []);

    // Payment enhancements
    let _ = conn.execute("ALTER TABLE payment_ledger ADD COLUMN payment_method TEXT", []);
    let _ = conn.execute("ALTER TABLE payment_ledger ADD COLUMN due_date TEXT", []);
    let _ = conn.execute("ALTER TABLE payment_ledger ADD COLUMN category TEXT", []);
    let _ = conn.execute("ALTER TABLE payment_ledger ADD COLUMN reference_number TEXT", []);
    let _ = conn.execute("ALTER TABLE payment_ledger ADD COLUMN external_payment_id TEXT", []);
    let _ = conn.execute("ALTER TABLE class_groups ADD COLUMN home_content TEXT", []);
    let _ = conn.execute("ALTER TABLE class_grades ADD COLUMN status TEXT NOT NULL DEFAULT 'graded'", []);
    let _ = conn.execute("ALTER TABLE grade_category_weights ADD COLUMN drop_lowest INTEGER NOT NULL DEFAULT 0", []);

    // Seed default session types if missing
    let _ = conn.execute(
        "INSERT OR IGNORE INTO session_types (name, label, sort_order, hostable, rsvpable, multi_day, allow_supplies, allow_attendance, allow_photos) VALUES
         ('class', 'Class', 1, 1, 1, 0, 1, 1, 1),
         ('field_trip', 'Field Trip', 2, 1, 1, 0, 1, 1, 1),
         ('holiday', 'Holiday', 3, 0, 0, 1, 0, 0, 0),
         ('meeting', 'Meeting', 4, 0, 0, 0, 0, 0, 0)",
        [],
    );
    let _ = conn.execute(
        "UPDATE session_types
         SET requires_location = 1,
             supports_cost = 1,
             cost_label = COALESCE(cost_label, 'Estimated cost')
         WHERE name = 'field_trip'",
        [],
    );

    // Default settings
    let _ = conn.execute(
        "INSERT OR IGNORE INTO app_settings (key, value) VALUES
         ('default_start_time', '09:00'),
         ('default_capacity', '10'),
         ('default_rsvp_cutoff_days', '1'),
         ('feature_blog', '1'),
         ('feature_resources', '1'),
         ('feature_lesson_plans', '1'),
         ('feature_member_directory', '1'),
         ('feature_student_progress', '1'),
         ('feature_families', '1'),
         ('feature_my_children', '1'),
         ('feature_my_rsvps', '1'),
         ('feature_class_groups', '1'),
         ('feature_notifications', '0'),
         ('feature_messaging', '0'),
         ('feature_documents', '1'),
         ('feature_standards', '1'),
         ('feature_payments', '1')",
        [],
    );

    // Default any existing sessions to 'class' if missing type
    let _ = conn.execute(
        "UPDATE class_sessions
         SET session_type_id = (SELECT id FROM session_types WHERE name = 'class')
         WHERE session_type_id IS NULL",
        [],
    );

    // Migrate legacy events into class_sessions (best-effort, idempotent)
    let _ = conn.execute(
        "INSERT INTO class_sessions (
            title, theme, session_date, start_time, end_time,
            host_id, host_address, lesson_plan_id, materials_needed,
            max_students, notes, status, session_type_id, rsvp_cutoff,
            created_by, created_at
         )
         SELECT
            e.title, NULL, e.event_date, e.start_time, e.end_time,
            NULL, NULL, NULL, NULL,
            NULL, e.description, 'open',
            (SELECT id FROM session_types WHERE name = e.event_type),
            NULL,
            e.created_by, e.created_at
         FROM events e
         WHERE NOT EXISTS (
            SELECT 1 FROM class_sessions cs
            WHERE cs.title = e.title
              AND cs.session_date = e.event_date
              AND IFNULL(cs.start_time, '') = IFNULL(e.start_time, '')
              AND IFNULL(cs.end_time, '') = IFNULL(e.end_time, '')
         )",
        [],
    );

    // Performance indexes
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_date ON class_sessions(session_date)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_status ON class_sessions(status)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_host ON class_sessions(host_id)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_rsvps_session ON rsvps(session_id)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_rsvps_student ON rsvps(student_id)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_student_parents_student ON student_parents(student_id)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_student_parents_user ON student_parents(user_id)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_files_linked ON files(linked_type, linked_id)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_lesson_plans_author ON lesson_plans(author_id)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_reset_tokens ON password_reset_tokens(token)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(active)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_users_family ON users(family_id)", []);
}

fn seed_admin(pool: &DbPool) {
    let conn = pool.get().expect("Failed to get connection for seeding");

    // Check if admin already exists
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE role = 'admin'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if count == 0 {
        // Create admin from environment variables, or skip if not set
        let admin_email = std::env::var("ADMIN_EMAIL").unwrap_or_else(|_| "admin@preschool.local".into());
        let admin_password = std::env::var("ADMIN_PASSWORD").unwrap_or_else(|_| {
            eprintln!("WARNING: No ADMIN_PASSWORD env var set. Using default 'admin123'. Change this immediately!");
            "admin123".into()
        });

        use argon2::{
            password_hash::{rand_core::OsRng, SaltString},
            Argon2, PasswordHasher,
        };

        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let hash = argon2
            .hash_password(admin_password.as_bytes(), &salt)
            .expect("Failed to hash admin password")
            .to_string();

        conn.execute(
            "INSERT INTO users (email, display_name, password_hash, role) VALUES (?1, ?2, ?3, 'admin')",
            params![admin_email, "Admin", hash],
        )
        .expect("Failed to seed admin user");

        println!("Created admin user: {}", admin_email);
    }
}

fn seed_site_pages(pool: &DbPool) {
    let conn = pool.get().expect("Failed to get connection for seeding pages");

    let about_content = r#"<h2>Our Philosophy</h2>
<p>Western Loudoun Preschool Co-op is built on the belief that learning happens best in a nurturing community environment. We emphasize play-based learning, where children develop social skills, creativity, and a love of exploration alongside their peers.</p>

<h2>How It Works</h2>
<p>Our co-op model means that parents actively participate in the classroom. Teachers lead engaging lessons and activities, while parents assist and learn alongside the children. This collaborative approach strengthens community bonds and ensures each child receives personalized attention.</p>

<h2>Host Expectations</h2>
<ul>
<li>Provide a safe, clean space suitable for preschool-aged children</li>
<li>Be present and engaged during sessions</li>
<li>Follow curriculum activities provided by teachers</li>
<li>Manage snacks and materials as discussed</li>
<li>Maintain open communication with teachers and parents</li>
<li>Ensure adequate supervision and safety protocols</li>
<li>Participate in co-op activities and occasional meetings</li>
</ul>

<h2>Field Trips</h2>
<ul>
<li>Regular trips to local parks, farms, and educational venues</li>
<li>Age-appropriate learning experiences in our community</li>
<li>Transportation and supervision coordinated by the co-op</li>
</ul>

<h2>Classmates</h2>
<ul>
<li>Small group sizes ensure individual attention</li>
<li>Mixed-age groups encourage peer learning</li>
<li>Diverse backgrounds enrich our community</li>
<li>Regular social activities build lasting friendships</li>
<li>Parents form a supportive network</li>
<li>Siblings often participate together</li>
</ul>

<h2>Cancellations &amp; Weather</h2>
<p>We monitor weather conditions closely and communicate any changes to parents promptly. Sessions may be rescheduled due to severe weather, but we embrace outdoor learning whenever possible. Parents will receive notification at least one hour before any session change when feasible.</p>

<p>During inclement weather, we move activities indoors and adapt our lesson plans accordingly. Our flexible scheduling allows us to accommodate last-minute changes when necessary for safety.</p>

<p>Illness and emergency situations may occasionally require cancellations. We ask parents to inform us as soon as possible so we can adjust plans accordingly.</p>

<h2>Scheduling Notes</h2>"#;

    let contact_content = r#"<h2>Get in Touch</h2>
<p><strong>Email:</strong> westernloudouncoop@gmail.com</p>
<p><strong>Location:</strong> Western Loudoun County area</p>
<p><strong>About Joining:</strong> We are always interested in welcoming new families to our co-op. If you'd like to learn more about our program or discuss membership, please reach out via email. We can discuss how our community might be a great fit for your family.</p>"#;

    let _ = conn.execute(
        "INSERT OR IGNORE INTO site_pages (slug, title, content) VALUES (?1, ?2, ?3)",
        params!["about", "About Our Co-op", about_content],
    );

    let _ = conn.execute(
        "INSERT OR IGNORE INTO site_pages (slug, title, content) VALUES (?1, ?2, ?3)",
        params!["contact", "Get in Touch", contact_content],
    );
}
