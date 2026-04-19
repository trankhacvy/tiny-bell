use std::path::PathBuf;

fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
    let workspace_root = PathBuf::from(&manifest_dir)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from(&manifest_dir));

    for candidate in [
        workspace_root.join(".env.local"),
        workspace_root.join(".env"),
        PathBuf::from(&manifest_dir).join(".env.local"),
        PathBuf::from(&manifest_dir).join(".env"),
    ] {
        if candidate.is_file() {
            let _ = dotenvy::from_path(&candidate);
            println!("cargo:rerun-if-changed={}", candidate.display());
        }
    }

    let client_id = std::env::var("VERCEL_CLIENT_ID").unwrap_or_default();
    let client_secret = std::env::var("VERCEL_CLIENT_SECRET").unwrap_or_default();
    let integration_slug = std::env::var("VERCEL_INTEGRATION_SLUG").unwrap_or_default();
    let railway_client_id = std::env::var("RAILWAY_CLIENT_ID").unwrap_or_default();
    let github_client_id = std::env::var("GITHUB_CLIENT_ID").unwrap_or_default();
    let github_client_secret = std::env::var("GITHUB_CLIENT_SECRET").unwrap_or_default();
    let profile = std::env::var("PROFILE").unwrap_or_default();

    if profile == "release" && (client_id.is_empty() || client_secret.is_empty()) {
        println!(
            "cargo:warning=VERCEL_CLIENT_ID / VERCEL_CLIENT_SECRET not set — Vercel OAuth will be disabled in this build. Users can still connect by pasting a token."
        );
    }

    if profile == "release" && railway_client_id.is_empty() {
        println!(
            "cargo:warning=RAILWAY_CLIENT_ID not set — Railway OAuth will be disabled in this build. Users can still connect by pasting a token."
        );
    }

    if profile == "release" && (github_client_id.is_empty() || github_client_secret.is_empty()) {
        println!(
            "cargo:warning=GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET not set — GitHub OAuth will be disabled in this build. Users can still connect by pasting a token."
        );
    }

    println!("cargo:rustc-env=VERCEL_CLIENT_ID={}", client_id);
    println!("cargo:rustc-env=VERCEL_CLIENT_SECRET={}", client_secret);
    println!("cargo:rustc-env=VERCEL_INTEGRATION_SLUG={}", integration_slug);
    println!("cargo:rustc-env=RAILWAY_CLIENT_ID={}", railway_client_id);
    println!("cargo:rustc-env=GITHUB_CLIENT_ID={}", github_client_id);
    println!("cargo:rustc-env=GITHUB_CLIENT_SECRET={}", github_client_secret);
    println!("cargo:rerun-if-env-changed=VERCEL_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=VERCEL_CLIENT_SECRET");
    println!("cargo:rerun-if-env-changed=VERCEL_INTEGRATION_SLUG");
    println!("cargo:rerun-if-env-changed=RAILWAY_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=GITHUB_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=GITHUB_CLIENT_SECRET");

    tauri_build::build()
}
