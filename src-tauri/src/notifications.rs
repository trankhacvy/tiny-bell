use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::NotificationExt;

use crate::adapters::DeploymentState;
use crate::cache::DiffEvent;

const COMMIT_MAX: usize = 80;

pub fn fire_for_diff<R: Runtime>(app: &AppHandle<R>, events: &[DiffEvent]) {
    let prefs = crate::prefs::load(app).unwrap_or_default();

    for event in events {
        let headline = match event.current {
            DeploymentState::Error => {
                if !prefs.notify_on_failure {
                    continue;
                }
                "Deployment failed"
            }
            DeploymentState::Ready => {
                let is_recovery = matches!(event.previous, Some(DeploymentState::Error));
                if is_recovery {
                    if !prefs.notify_on_recovery {
                        continue;
                    }
                    "Deployment recovered"
                } else {
                    "Deployment ready"
                }
            }
            DeploymentState::Canceled => {
                if !prefs.notify_on_failure {
                    continue;
                }
                "Deployment canceled"
            }
            _ => continue,
        };

        let title = format!("{} · {}", event.project_name, headline);
        let body = build_body(event);

        let _ = app
            .notification()
            .builder()
            .title(title)
            .body(body)
            .show();
    }
}

fn build_body(event: &DiffEvent) -> String {
    let mut lines: Vec<String> = Vec::new();

    if let Some(msg) = event.commit_message.as_deref() {
        let first_line = msg.lines().next().unwrap_or("").trim();
        if !first_line.is_empty() {
            lines.push(truncate(first_line, COMMIT_MAX));
        }
    }

    let mut meta: Vec<String> = Vec::new();
    if let Some(branch) = event.branch.as_deref() {
        let trimmed = branch.trim();
        if !trimmed.is_empty() {
            meta.push(trimmed.to_string());
        }
    }
    if let Some(author) = event.author_name.as_deref() {
        let trimmed = author.trim();
        if !trimmed.is_empty() {
            meta.push(trimmed.to_string());
        }
    }
    if !meta.is_empty() {
        lines.push(meta.join(" · "));
    }

    if lines.is_empty() {
        event.project_name.clone()
    } else {
        lines.join("\n")
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::DeploymentState;

    fn base_event() -> DiffEvent {
        DiffEvent {
            project_id: "prj_1".into(),
            project_name: "memespin".into(),
            deployment_id: "dpl_1".into(),
            previous: Some(DeploymentState::Building),
            current: DeploymentState::Error,
            commit_message: None,
            branch: None,
            author_name: None,
            inspector_url: None,
            url: None,
        }
    }

    #[test]
    fn body_includes_commit_and_meta_when_present() {
        let event = DiffEvent {
            commit_message: Some("feat(web): optimize image loading — resize assets".into()),
            branch: Some("dev".into()),
            author_name: Some("Maya".into()),
            ..base_event()
        };
        let body = build_body(&event);
        assert!(body.contains("feat(web): optimize image loading"));
        assert!(body.contains("dev"));
        assert!(body.contains("Maya"));
    }

    #[test]
    fn body_uses_only_first_line_of_commit_message() {
        let event = DiffEvent {
            commit_message: Some("fix: bad thing\n\nMore context goes here".into()),
            ..base_event()
        };
        let body = build_body(&event);
        assert!(body.contains("fix: bad thing"));
        assert!(!body.contains("More context"));
    }

    #[test]
    fn body_truncates_long_commit_messages() {
        let long = "a".repeat(200);
        let event = DiffEvent {
            commit_message: Some(long),
            ..base_event()
        };
        let body = build_body(&event);
        let first = body.lines().next().unwrap();
        assert!(first.ends_with('…'));
        assert!(first.chars().count() <= COMMIT_MAX);
    }

    #[test]
    fn body_falls_back_to_project_name_when_nothing_else() {
        let event = base_event();
        assert_eq!(build_body(&event), "memespin");
    }

    #[test]
    fn body_skips_empty_branch_and_author() {
        let event = DiffEvent {
            commit_message: Some("fix: x".into()),
            branch: Some("   ".into()),
            author_name: Some("".into()),
            ..base_event()
        };
        let body = build_body(&event);
        assert_eq!(body, "fix: x");
    }
}
