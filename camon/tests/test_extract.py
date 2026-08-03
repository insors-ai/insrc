from camon.extract import provider_for_host, safe_url_parts, usage_from_json


def test_extracts_openai_usage_without_persisting_body():
    assert usage_from_json(b'{"model":"gpt-test","usage":{"input_tokens":8,"output_tokens":2}}') == ("gpt-test", 8, 2)


def test_provider_and_safe_url_parts():
    assert provider_for_host("api.anthropic.com") == "anthropic"
    assert safe_url_parts("https://api.openai.com/v1/responses?api_key=nope") == ("api.openai.com", "/v1/responses")
