export interface AgentInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
  capabilities: string[];
  entryPoints: EntryPoint[];
  welcomeMessage: string;
}

export interface EntryPoint {
  view: string;
  label: string;
  initialPrompt?: string;
}
