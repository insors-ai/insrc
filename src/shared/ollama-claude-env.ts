/** Route one Claude subprocess to Ollama without changing the parent's login or routing. */
export function ollamaClaudeEnv(base: NodeJS.ProcessEnv, host: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...base,
    ANTHROPIC_BASE_URL: host,
    ANTHROPIC_AUTH_TOKEN: 'ollama',
    ANTHROPIC_API_KEY: '',
  };
  for (const key of ['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) delete env[key];
  return env;
}
