pub fn sanitize_html(input: &str) -> String {
    use ammonia::{Builder, UrlRelative};
    Builder::default()
        .add_tags(["table", "thead", "tbody", "tr", "th", "td", "mark", "div"])
        .add_tag_attributes("table", ["class"])
        .add_tag_attributes("td", ["colspan", "rowspan"])
        .add_tag_attributes("th", ["colspan", "rowspan"])
        .add_tag_attributes("div", ["data-excalidraw"])
        .add_tag_attributes("img", ["src", "alt", "title", "class", "style"])
        .add_tag_attributes("span", ["data-comment", "style"])
        .add_tag_attributes("p", ["style"])
        .add_tag_attributes("h1", ["style"])
        .add_tag_attributes("h2", ["style"])
        .add_tag_attributes("h3", ["style"])
        .url_relative(UrlRelative::PassThrough)
        .add_url_schemes(["http", "https", "data"])
        .clean(input)
        .to_string()
}

/// Strip all HTML tags from a single-line text field (titles, names, etc.)
pub fn sanitize_text(input: &str) -> String {
    ammonia::Builder::empty()
        .clean(input)
        .to_string()
        .trim()
        .to_string()
}

/// Validate that a required field is non-empty after trimming
pub fn validate_required(field: &str, field_name: &str) -> Result<String, crate::errors::AppError> {
    let trimmed = field.trim().to_string();
    if trimmed.is_empty() {
        Err(crate::errors::AppError::BadRequest(format!("{} is required", field_name)))
    } else {
        Ok(trimmed)
    }
}

/// Validate and parse a date string (YYYY-MM-DD format)
pub fn validate_date(date_str: &str, field_name: &str) -> Result<String, crate::errors::AppError> {
    chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
        .map_err(|_| crate::errors::AppError::BadRequest(format!("{} must be a valid date (YYYY-MM-DD)", field_name)))?;
    Ok(date_str.to_string())
}

/// Validate string length
pub fn validate_max_length(field: &str, max: usize, field_name: &str) -> Result<(), crate::errors::AppError> {
    if field.len() > max {
        Err(crate::errors::AppError::BadRequest(format!("{} must be {} characters or fewer", field_name, max)))
    } else {
        Ok(())
    }
}

/// Validate password meets security requirements
pub fn validate_password(password: &str) -> Result<(), crate::errors::AppError> {
    let mut errors = Vec::new();

    if password.len() < 8 {
        errors.push("at least 8 characters");
    }
    if !password.chars().any(|c| c.is_uppercase()) {
        errors.push("an uppercase letter");
    }
    if !password.chars().any(|c| c.is_lowercase()) {
        errors.push("a lowercase letter");
    }
    if !password.chars().any(|c| c.is_ascii_digit()) {
        errors.push("a number");
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(crate::errors::AppError::BadRequest(
            format!("Password must contain {}", errors.join(", "))
        ))
    }
}
