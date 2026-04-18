use once_cell::sync::Lazy;
use regex::Regex;

const KEYS: &str =
    "token|access_token|refresh_token|authorization|code|client_secret|code_verifier|password|api[_-]?key";

static BEARER_HEADER: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?i)\bbearer\s+([A-Za-z0-9._\-+/=]{4,})"#).expect("bearer regex"));

static JSON_PAIR: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        r#"(?i)"({KEYS})"\s*:\s*"([^"]{{4,}})""#
    ))
    .expect("json regex")
});

static QUOTED_PAIR: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        r#"(?i)\b({KEYS})\s*[:=]\s*"([^"]{{4,}})""#
    ))
    .expect("quoted regex")
});

static PLAIN_PAIR: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        r#"(?i)\b({KEYS})\s*[:=]\s*([A-Za-z0-9._\-+/=]{{4,}})"#
    ))
    .expect("plain regex")
});

pub fn redact(input: &str) -> String {
    let a = BEARER_HEADER.replace_all(input, "Bearer ***");
    let b = JSON_PAIR.replace_all(&a, |caps: &regex::Captures| {
        format!(r#""{}":"***""#, &caps[1])
    });
    let c = QUOTED_PAIR.replace_all(&b, |caps: &regex::Captures| {
        format!("{}=***", &caps[1])
    });
    let d = PLAIN_PAIR.replace_all(&c, |caps: &regex::Captures| {
        format!("{}=***", &caps[1])
    });
    d.into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_token_kv() {
        let input = r#"{"token":"abcdef1234567890"}"#;
        let out = redact(input);
        assert!(!out.contains("abcdef1234567890"), "got: {out}");
        assert!(out.contains("***"));
    }

    #[test]
    fn redacts_bearer_header() {
        let input = "Authorization: Bearer sk-abcdef12345";
        let out = redact(input);
        assert!(!out.contains("sk-abcdef12345"), "got: {out}");
    }

    #[test]
    fn redacts_access_token_and_code_verifier() {
        let input = r#"access_token=abcdef12345&code_verifier=xyz9876543"#;
        let out = redact(input);
        assert!(!out.contains("abcdef12345"));
        assert!(!out.contains("xyz9876543"));
    }

    #[test]
    fn leaves_non_sensitive_content_alone() {
        let input = "user id: 42, project: acme-web";
        assert_eq!(redact(input), input);
    }

    #[test]
    fn redacts_client_secret() {
        let input = r#"client_secret="verysecretvalue123""#;
        let out = redact(input);
        assert!(!out.contains("verysecretvalue123"), "got: {out}");
    }
}
