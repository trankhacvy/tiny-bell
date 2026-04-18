use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::NotificationExt;

use crate::adapters::DeploymentState;
use crate::cache::DiffEvent;

pub fn fire_for_diff<R: Runtime>(app: &AppHandle<R>, events: &[DiffEvent]) {
    for event in events {
        let (title, body) = match event.current {
            DeploymentState::Ready => ("Deployment ready", event.project_name.clone()),
            DeploymentState::Error => ("Deployment failed", event.project_name.clone()),
            DeploymentState::Canceled => {
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
