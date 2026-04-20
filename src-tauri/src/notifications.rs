use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::NotificationExt;

use crate::adapters::DeploymentState;
use crate::cache::DiffEvent;

pub fn fire_for_diff<R: Runtime>(app: &AppHandle<R>, events: &[DiffEvent]) {
    let prefs = crate::prefs::load(app).unwrap_or_default();

    for event in events {
        let (title, body) = match event.current {
            DeploymentState::Error => {
                if !prefs.notify_on_failure {
                    continue;
                }
                ("Deployment failed", event.project_name.clone())
            }
            DeploymentState::Ready => {
                // Recovery = Error → Ready. Regular successful deploys
                // (Building → Ready) are always announced; only the
                // recovery case is gated by `notify_on_recovery`.
                let is_recovery = matches!(event.previous, Some(DeploymentState::Error));
                if is_recovery && !prefs.notify_on_recovery {
                    continue;
                }
                ("Deployment ready", event.project_name.clone())
            }
            DeploymentState::Canceled => {
                // Treat cancel as a failure-class signal so
                // `notify_on_failure = false` silences it too.
                if !prefs.notify_on_failure {
                    continue;
                }
                ("Deployment canceled", event.project_name.clone())
            }
            _ => continue,
        };
        let _ = app
            .notification()
            .builder()
            .title(title)
            .body(body)
            .show();
    }
}
