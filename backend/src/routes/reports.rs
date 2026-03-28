use axum::{
    extract::{Path, State},
    http::header,
    response::IntoResponse,
};
use rusqlite::params;

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::AppState;

/// GET /api/class-groups/{id}/report-card/{student_id} — generates CSV report card
pub async fn get_report_card(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path((group_id, student_id)): Path<(i64, i64)>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.db.get()?;

    // Access check: admin/teacher sees all, parent sees own children
    if user.role != "admin" && user.role != "teacher" {
        let is_parent: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM student_parents WHERE student_id = ?1 AND user_id = ?2",
                params![student_id, user.id],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if !is_parent {
            return Err(AppError::Forbidden);
        }
    }

    // Get student name
    let student_name: String = conn
        .query_row(
            "SELECT first_name || ' ' || last_name FROM students WHERE id = ?1",
            params![student_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound("Student not found".into()))?;

    // Get class group name
    let group_name: String = conn
        .query_row(
            "SELECT name FROM class_groups WHERE id = ?1",
            params![group_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound("Class group not found".into()))?;

    // Get assignments with grades for this student in this group
    let mut stmt = conn.prepare(
        "SELECT ca.title, ca.category, ca.max_points,
                cg.score, cg.status
         FROM class_assignments ca
         LEFT JOIN class_grades cg ON ca.id = cg.assignment_id AND cg.student_id = ?1
         WHERE ca.group_id = ?2
         ORDER BY ca.category, ca.title",
    )?;

    let mut csv = String::new();
    csv.push_str("Student,Class,Assignment,Category,Max Points,Score,Status\r\n");

    let mut category_totals: std::collections::HashMap<String, (f64, f64, i32)> =
        std::collections::HashMap::new(); // category -> (earned, possible, count)
    let mut overall_earned = 0.0_f64;
    let mut overall_possible = 0.0_f64;

    let rows: Vec<(String, Option<String>, f64, Option<f64>, Option<String>)> = stmt
        .query_map(params![student_id, group_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, Option<f64>>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    for (title, category, max_points, score, status) in &rows {
        let cat = category.clone().unwrap_or_else(|| "Uncategorized".into());
        let score_str = score.map(|s| s.to_string()).unwrap_or_default();
        let status_str = status.clone().unwrap_or_else(|| "ungraded".into());

        csv.push_str(&format!(
            "\"{}\",\"{}\",\"{}\",\"{}\",{},{},{}\r\n",
            student_name, group_name, title, cat, max_points, score_str, status_str
        ));

        if let Some(s) = score {
            let entry = category_totals
                .entry(cat.clone())
                .or_insert((0.0, 0.0, 0));
            entry.0 += s;
            entry.1 += max_points;
            entry.2 += 1;
            overall_earned += s;
            overall_possible += max_points;
        }
    }

    // Category averages
    csv.push_str("\r\nCategory Averages\r\n");
    csv.push_str("Category,Average %\r\n");
    for (cat, (earned, possible, _count)) in &category_totals {
        let avg = if *possible > 0.0 {
            (earned / possible) * 100.0
        } else {
            0.0
        };
        csv.push_str(&format!("\"{}\",{:.1}\r\n", cat, avg));
    }

    // Overall average
    let overall_avg = if overall_possible > 0.0 {
        (overall_earned / overall_possible) * 100.0
    } else {
        0.0
    };
    csv.push_str(&format!("\r\nOverall Average,{:.1}\r\n", overall_avg));

    let filename = format!(
        "report_card_{}_{}.csv",
        student_name.replace(' ', "_"),
        group_name.replace(' ', "_")
    );

    Ok((
        [
            (header::CONTENT_TYPE, "text/csv".to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}\"", filename),
            ),
        ],
        csv,
    ))
}
