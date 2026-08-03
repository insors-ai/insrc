from camon.attribution import classify_text
from camon.config import AgentRule


def test_rules_precede_built_in_classification():
    rules = [AgentRule(name="team-agent", pattern="my-agent", priority=1)]
    assert classify_text("python my-agent", rules) == "team-agent"
    assert classify_text("/usr/local/bin/claude", []) == "claude-code"
