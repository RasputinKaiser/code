use napi::JsObject;
use napi_derive::napi;
use textwrap::{wrap, Options as WrapOptions, WordSplitter};

#[napi(js_name = "renderFencedCode")]
pub fn render_fenced_code(code: String, options: Option<JsObject>) -> Option<Vec<String>> {
    let width = options
        .as_ref()
        .and_then(|opts| opts.get_named_property::<u32>("terminalWidth").ok())
        .filter(|&w| w > 0)
        .unwrap_or(80);

    Some(wrap_with_width(&code, width as usize))
}

fn wrap_with_width(code: &str, width: usize) -> Vec<String> {
    let width = width.max(1);
    let opts = WrapOptions::new(width).word_splitter(WordSplitter::NoHyphenation);
    code.lines()
        .flat_map(|line| {
            if line.is_empty() {
                vec![String::new()]
            } else {
                wrap(line, &opts)
                    .into_iter()
                    .map(|cow| cow.to_string())
                    .collect::<Vec<_>>()
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::wrap_with_width;

    #[test]
    fn wraps_lines_on_terminal_width() {
        let result = wrap_with_width("fn main() { println!(\"hi\"); }", 10);
        assert!(result.iter().all(|line| line.len() <= 10));
    }

    #[test]
    fn keeps_empty_lines() {
        let result = wrap_with_width("line1\n\nline3", 80);
        assert_eq!(result[1], "");
    }
}
