use std::ffi::OsString;
use std::path::Path;

use crate::{HOST_NODE_PATH_ENV, HOST_RUNTIME_PATH_ENV, app_server_subcommand_index};

const VALUE_OPTIONS: &[&str] = &[
    "-c",
    "--config",
    "--enable",
    "--disable",
    "--remote",
    "--remote-auth-token-env",
    "-m",
    "--model",
    "--local-provider",
    "-p",
    "--profile",
    "-s",
    "--sandbox",
    "-C",
    "--cd",
    "--listen",
    "--ws-auth",
    "--ws-token-file",
    "--ws-token-sha256",
    "--ws-shared-secret-file",
    "--ws-issuer",
    "--ws-audience",
    "--ws-max-clock-skew-seconds",
];

pub(crate) fn trace_invocation(
    arguments: &[OsString],
    desktop_helper: bool,
    stock_codex_path: &Path,
    host_runtime_selected: bool,
) {
    if std::env::var_os("CODEXHOST_STARTUP_TRACE").as_deref() != Some("1".as_ref()) {
        return;
    }

    let app_server_index = app_server_subcommand_index(arguments);
    let host_paths_configured = std::env::var_os(HOST_NODE_PATH_ENV).is_some()
        && std::env::var_os(HOST_RUNTIME_PATH_ENV).is_some();
    let host_route_eligible = !desktop_helper && crate::should_start_host_runtime(arguments);
    let originator = match std::env::var_os("CODEX_INTERNAL_ORIGINATOR_OVERRIDE") {
        None => "absent",
        Some(value) if value.is_empty() => "empty",
        Some(value) if value == "Codex Desktop" => "desktop",
        Some(_) => "other",
    };

    eprintln!(
        "[codexhost startup] shim: invocation argc={} argv_shape={} app_server_index={:?} desktop_helper={} host_route_eligible={} originator={} host_paths_configured={} data_directory_configured={} stock_cli_exists={} host_runtime_selected={}",
        arguments.len(),
        sanitized_argument_shape(arguments),
        app_server_index,
        desktop_helper,
        host_route_eligible,
        originator,
        host_paths_configured,
        std::env::var_os("CODEXHOST_DATA_DIR").is_some(),
        stock_codex_path.is_file(),
        host_runtime_selected,
    );
}

fn sanitized_argument_shape(arguments: &[OsString]) -> String {
    let mut shape = Vec::with_capacity(arguments.len());
    let mut index = 0;
    while let Some(argument) = arguments.get(index).and_then(|value| value.to_str()) {
        if argument == "app-server" {
            shape.push(argument.to_owned());
            index += 1;
            continue;
        }
        if VALUE_OPTIONS.contains(&argument) {
            shape.push(argument.to_owned());
            shape.push("<value>".into());
            index += 2;
            continue;
        }
        if let Some((option, _)) = argument.split_once('=')
            && option.starts_with('-')
        {
            shape.push(format!("{option}=<value>"));
        } else if argument.starts_with('-') {
            shape.push(argument.to_owned());
        } else {
            shape.push("<arg>".into());
        }
        index += 1;
    }
    if index < arguments.len() {
        shape.push("<non-utf8>".into());
    }
    shape.join(" ")
}

#[cfg(test)]
mod tests {
    use super::sanitized_argument_shape;
    use std::ffi::OsString;

    #[test]
    fn argument_shape_preserves_options_and_redacts_values() {
        let arguments = [
            "--config".into(),
            "api_key=secret".into(),
            "--new-option=secret".into(),
            "app-server".into(),
            "--listen".into(),
            "stdio://private".into(),
            "sensitive positional text".into(),
        ];

        assert_eq!(
            sanitized_argument_shape(&arguments),
            "--config <value> --new-option=<value> app-server --listen <value> <arg>"
        );
    }

    #[cfg(unix)]
    #[test]
    fn argument_shape_marks_non_utf8_values_without_rendering_them() {
        use std::os::unix::ffi::OsStringExt;

        let arguments = [OsString::from_vec(vec![0xff])];
        assert_eq!(sanitized_argument_shape(&arguments), "<non-utf8>");
    }
}
