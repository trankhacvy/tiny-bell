pub mod oauth;
pub mod pat;
pub mod vercel;

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("state mismatch — possible CSRF")]
    StateMismatch,
    #[error("authorization code missing")]
    MissingCode,
    #[error("provider returned error: {0}")]
    Provider(String),
    #[error("authentication timed out")]
    Timeout,
    #[error("loopback server closed unexpectedly")]
    ServerClosed,
    #[error("loopback server bind failed: {0}")]
    Server(String),
    #[error("network: {0}")]
    Network(String),
    #[error("keychain: {0}")]
    Keychain(String),
    #[error("store: {0}")]
    Store(String),
    #[error("config: {0}")]
    Config(String),
    #[error("unsupported: {0}")]
    Unsupported(String),
}

impl From<reqwest::Error> for AuthError {
    fn from(e: reqwest::Error) -> Self {
        AuthError::Network(e.to_string())
    }
}

impl From<keyring::Error> for AuthError {
    fn from(e: keyring::Error) -> Self {
        AuthError::Keychain(e.to_string())
    }
}

impl From<std::io::Error> for AuthError {
    fn from(e: std::io::Error) -> Self {
        AuthError::Server(e.to_string())
    }
}
