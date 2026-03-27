use lettre::message::{MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

#[derive(Clone, Debug)]
pub struct EmailConfig {
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_user: String,
    pub smtp_pass: String,
    pub smtp_from: String,
    pub site_url: String,
}

impl EmailConfig {
    pub fn from_env() -> Self {
        let smtp_user = std::env::var("SMTP_USER").unwrap_or_default();
        let smtp_pass = std::env::var("SMTP_PASS").unwrap_or_default();
        let smtp_host =
            std::env::var("SMTP_HOST").unwrap_or_else(|_| "smtp.gmail.com".to_string());
        let smtp_port = std::env::var("SMTP_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(587);
        let smtp_from = std::env::var("SMTP_FROM").unwrap_or_else(|_| {
            if !smtp_user.is_empty() {
                format!("Western Loudoun Preschool Co-op <{}>", smtp_user)
            } else {
                "Western Loudoun Preschool Co-op <westernloudouncoop@gmail.com>".to_string()
            }
        });
        let site_url = std::env::var("SITE_URL")
            .unwrap_or_else(|_| "https://westernloudouncoop.org".to_string());

        EmailConfig {
            smtp_host,
            smtp_port,
            smtp_user,
            smtp_pass,
            smtp_from,
            site_url,
        }
    }
}

// ── Branded email wrapper ────────────────────────────────────────────
// Matches site colors: ink #1e2a35, cobalt #1f4b7a, cream #faf8f5

fn wrap_branded(site_url: &str, heading: &str, body_html: &str) -> String {
    // Using .replace() instead of format!() to avoid panics when body_html
    // contains literal { or } characters (common in user-authored HTML/CSS).
    r##"<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3f0;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#1f4b7a;padding:28px 32px;text-align:center;">
            <div style="font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:6px;">Western Loudoun Preschool Co-op</div>
            <div style="font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">%%HEADING%%</div>
          </td>
        </tr>
        <!-- Accent rule -->
        <tr><td style="height:3px;background:linear-gradient(90deg,#1f4b7a 0%,#2d6ea8 50%,#1f4b7a 100%);"></td></tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;color:#1e2a35;font-size:15px;line-height:1.65;">
            %%BODY%%
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #eee;text-align:center;">
            <div style="font-size:12px;color:#999;line-height:1.5;">
              <a href="%%SITEURL%%" style="color:#1f4b7a;text-decoration:none;font-weight:600;">westernloudouncoop.org</a>
              <br>Western Loudoun Preschool Co-op &middot; Loudoun County, VA
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"##
        .replace("%%HEADING%%", heading)
        .replace("%%BODY%%", body_html)
        .replace("%%SITEURL%%", site_url)
}

fn make_button(url: &str, label: &str) -> String {
    format!(
        r#"<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#1f4b7a;border-radius:8px;"><a href="{url}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">{label}</a></td></tr></table>"#,
        url = url,
        label = label,
    )
}

fn make_detail_row(label: &str, value: &str) -> String {
    format!(
        r#"<tr><td style="padding:8px 12px;color:#999;font-size:13px;width:90px;vertical-align:top;">{}</td><td style="padding:8px 12px;color:#1e2a35;font-size:15px;font-weight:500;">{}</td></tr>"#,
        label, value,
    )
}

// ── Core send function ───────────────────────────────────────────────

pub async fn send_email(
    config: &EmailConfig,
    to: &str,
    subject: &str,
    html_body: &str,
) -> Result<(), String> {
    eprintln!("[email] Attempting to send '{}' to {}", subject, to);
    eprintln!("[email] SMTP config: host={}, port={}, user={}, from={}",
        config.smtp_host, config.smtp_port,
        if config.smtp_user.is_empty() { "<empty>" } else { &config.smtp_user },
        config.smtp_from);

    if config.smtp_user.is_empty() {
        eprintln!("[email] SMTP_USER not configured, email not sent to {}", to);
        return Ok(());
    }

    let creds = Credentials::new(config.smtp_user.clone(), config.smtp_pass.clone());

    eprintln!("[email] Building SMTP transport...");
    let transport: AsyncSmtpTransport<Tokio1Executor> =
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.smtp_host)
            .map_err(|e| {
                eprintln!("[email] SMTP relay error: {}", e);
                format!("SMTP relay error: {}", e)
            })?
            .credentials(creds)
            .port(config.smtp_port)
            .build();

    // Strip tags for the plain-text alternative
    let plain = html_body
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("</p>", "\n\n")
        .replace("</tr>", "\n")
        .replace("</td>", "  ")
        .chars()
        .fold((String::new(), false), |(mut out, in_tag), c| {
            if c == '<' { (out, true) }
            else if c == '>' { (out, false) }
            else if !in_tag { out.push(c); (out, false) }
            else { (out, true) }
        })
        .0;

    eprintln!("[email] Building message (body len={}, plain len={})...", html_body.len(), plain.len());

    let email = Message::builder()
        .from(
            config
                .smtp_from
                .parse()
                .map_err(|e| {
                    eprintln!("[email] Invalid from address '{}': {}", config.smtp_from, e);
                    format!("Invalid from: {}", e)
                })?,
        )
        .to(to.parse().map_err(|e| {
            eprintln!("[email] Invalid to address '{}': {}", to, e);
            format!("Invalid to: {}", e)
        })?)
        .subject(subject)
        .multipart(
            MultiPart::alternative()
                .singlepart(SinglePart::plain(plain))
                .singlepart(SinglePart::html(html_body.to_string())),
        )
        .map_err(|e| {
            eprintln!("[email] Email build error: {}", e);
            format!("Email build error: {}", e)
        })?;

    eprintln!("[email] Sending via SMTP...");
    transport
        .send(email)
        .await
        .map_err(|e| {
            eprintln!("[email] Send error: {}", e);
            format!("Send error: {}", e)
        })?;
    eprintln!("[email] Successfully sent '{}' to {}", subject, to);
    Ok(())
}

// ── Specific email types ─────────────────────────────────────────────

pub async fn send_password_reset_email(
    config: &EmailConfig,
    to: &str,
    display_name: &str,
    token: &str,
) -> Result<(), String> {
    let reset_url = format!("{}/reset-password?token={}", config.site_url, token);
    let body = format!(
        r#"<p>Hi {name},</p>
<p>You requested a password reset for your co-op account. Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
{button}
<p style="font-size:13px;color:#888;">Or copy this link: <a href="{url}" style="color:#1f4b7a;">{url}</a></p>
<p style="font-size:13px;color:#888;">If you didn't request this, you can safely ignore this email.</p>"#,
        name = display_name,
        button = make_button(&reset_url, "Reset Password"),
        url = reset_url,
    );
    let html = wrap_branded(&config.site_url, "Password Reset", &body);
    send_email(config, to, "Password Reset — WLPC", &html).await
}

pub async fn send_invite_email(
    config: &EmailConfig,
    to: &str,
    invite_code: &str,
    role: &str,
) -> Result<(), String> {
    let register_url = format!(
        "{}/register?code={}&email={}",
        config.site_url, invite_code, to
    );
    let role_label = match role {
        "teacher" => "Teacher",
        "parent" => "Parent",
        _ => role,
    };
    let body = format!(
        r#"<p>You've been invited to join <strong>Western Loudoun Preschool Co-op</strong> as a <strong>{role}</strong>.</p>
<p>Click below to create your account and get started:</p>
{button}
<p style="font-size:13px;color:#888;">Or copy this link: <a href="{url}" style="color:#1f4b7a;">{url}</a></p>
<p style="font-size:13px;color:#888;">This invitation expires in 7 days.</p>"#,
        role = role_label,
        button = make_button(&register_url, "Create Your Account"),
        url = register_url,
    );
    let html = wrap_branded(&config.site_url, "You're Invited!", &body);
    send_email(config, to, "You're Invited to Join WLPC!", &html).await
}

pub async fn send_class_reminder_email(
    config: &EmailConfig,
    to: &str,
    parent_name: &str,
    session_title: &str,
    session_date: &str,
    start_time: Option<&str>,
    end_time: Option<&str>,
    location: &str,
    session_id: i64,
) -> Result<(), String> {
    let time_str = match (start_time, end_time) {
        (Some(s), Some(e)) => format!("{} &ndash; {}", s, e),
        (Some(s), None) => s.to_string(),
        _ => "See session details".to_string(),
    };

    let details = format!(
        r#"<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #eee;border-radius:8px;overflow:hidden;margin:16px 0;">
{date_row}
{time_row}
{location_row}
</table>"#,
        date_row = make_detail_row("Date", session_date),
        time_row = make_detail_row("Time", &time_str),
        location_row = make_detail_row("Location", location),
    );

    let session_url = format!("{}/sessions/{}", config.site_url, session_id);
    let body = format!(
        r#"<p>Hi {name},</p>
<p>Just a friendly reminder that <strong>{title}</strong> is coming up tomorrow!</p>
{details}
{button}
<p style="font-size:13px;color:#888;">We look forward to seeing you there!</p>"#,
        name = parent_name,
        title = session_title,
        details = details,
        button = make_button(&session_url, "View Session Details"),
    );
    let html = wrap_branded(&config.site_url, "Class Reminder", &body);
    send_email(
        config,
        to,
        &format!("Reminder: {} — Tomorrow", session_title),
        &html,
    )
    .await
}

pub async fn send_bulk_email(
    config: &EmailConfig,
    recipients: Vec<(String, String)>,
    subject: &str,
    body_content: &str,
) -> Result<usize, String> {
    eprintln!("[email] send_bulk_email: subject='{}', recipients={}, body_len={}",
        subject, recipients.len(), body_content.len());

    if config.smtp_user.is_empty() {
        eprintln!("[email] SMTP_USER not configured, bulk email not sent to {} recipients",
            recipients.len());
        return Ok(0);
    }

    // Wrap the admin's message in the branded template
    // Using string concat instead of format! to avoid panics on { or } in body_content
    let body_html = String::from("<div style=\"white-space:pre-wrap;\">")
        + body_content
        + "</div>";
    let html = wrap_branded(&config.site_url, subject, &body_html);

    let mut sent = 0;
    for (email, _name) in &recipients {
        match send_email(config, email, subject, &html).await {
            Ok(()) => sent += 1,
            Err(e) => eprintln!("[email] Failed to send to {}: {}", email, e),
        }
    }
    eprintln!("[email] Bulk send complete: {}/{} sent", sent, recipients.len());
    Ok(sent)
}
